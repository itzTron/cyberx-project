import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

const githubLikeSanitizeSchema: any = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'details', 'summary'],
  attributes: {
    ...(defaultSchema.attributes || {}),
    '*': [...((defaultSchema.attributes?.['*'] as any[]) || []), 'align'],
    a: [...((defaultSchema.attributes?.a as any[]) || []), 'target', 'rel'],
    img: [...((defaultSchema.attributes?.img as any[]) || []), 'alt', 'align', 'width', 'height'],
    div: [...((defaultSchema.attributes?.div as any[]) || []), 'align'],
    p: [...((defaultSchema.attributes?.p as any[]) || []), 'align'],
    h1: [...((defaultSchema.attributes?.h1 as any[]) || []), 'align'],
    h2: [...((defaultSchema.attributes?.h2 as any[]) || []), 'align'],
    h3: [...((defaultSchema.attributes?.h3 as any[]) || []), 'align'],
    h4: [...((defaultSchema.attributes?.h4 as any[]) || []), 'align'],
    h5: [...((defaultSchema.attributes?.h5 as any[]) || []), 'align'],
    h6: [...((defaultSchema.attributes?.h6 as any[]) || []), 'align'],
  },
};

const getLanguage = (className: string | undefined) => {
  const match = /language-([a-z0-9#+-]+)/i.exec(className || '');
  return (match?.[1] || '').toLowerCase();
};

const normalizeLanguage = (language: string) => {
  const aliases: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    csharp: 'csharp',
    'c#': 'csharp',
    text: 'plaintext',
  };

  return aliases[language] || language || 'plaintext';
};

type GitHubReadmeProps = {
  content: string;
  className?: string;
  resolveAssetUrl?: (src: string) => string;
};

const resolveReadmeAssetUrl = (value: string | undefined) => {
  const raw = (value || '').trim();
  if (!raw) {
    return raw;
  }

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('/')
  ) {
    return raw;
  }

  return `/${raw.replace(/^\.?\//, '')}`;
};

const isImageOnlyParagraph = (node: any) => {
  const children = node?.children || [];
  if (!children.length) {
    return false;
  }

  const isWhitespaceText = (child: any) => child?.type === 'text' && !(child?.value || '').trim();
  const isBreak = (child: any) => child?.type === 'element' && child?.tagName === 'br';
  const isImage = (child: any) => child?.type === 'element' && child?.tagName === 'img';
  const isLinkedImage = (child: any) =>
    child?.type === 'element' &&
    child?.tagName === 'a' &&
    (child?.children || []).every((nested: any) => isWhitespaceText(nested) || isImage(nested));

  return children.every((child: any) => {
    return isWhitespaceText(child) || isBreak(child) || isImage(child) || isLinkedImage(child);
  });
};

const GitHubReadme = ({ content, className, resolveAssetUrl }: GitHubReadmeProps) => {
  return (
    <article
      className={cn(
        'prose prose-sm prose-invert max-w-none break-words',
        '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:text-left',
        '[&_code]:before:content-none [&_code]:after:content-none',
        '[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, githubLikeSanitizeSchema]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          p: ({ node, children, ...props }) => {
            if (isImageOnlyParagraph(node)) {
              return (
                <p
                  {...props}
                  className={cn(
                    'my-2 flex flex-wrap items-center gap-2 leading-none [&_img]:!inline-block [&_img]:!my-0 [&_img]:align-middle [&_a]:inline-flex [&_a]:items-center',
                    (props as any).className,
                  )}
                >
                  {children}
                </p>
              );
            }

            return <p {...props}>{children}</p>;
          },
          a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          img: ({ ...props }) => (
            (() => {
              const source = props.src || '';
              const resolvedSource = (resolveAssetUrl ? resolveAssetUrl(source) : '') || resolveReadmeAssetUrl(source);
              return (
                <img
                  {...props}
                  src={resolvedSource}
                  loading="lazy"
                  className={cn('max-w-full h-auto align-middle !inline-block', props.className)}
                />
              );
            })()
          ),
          code: ({ className: codeClassName, children, inline, ...props }) => {
            const language = normalizeLanguage(getLanguage(codeClassName));
            const code = String(children).replace(/\n$/, '');

            if (inline) {
              return (
                <code
                  {...props}
                  className={cn('rounded-md bg-muted/60 px-1.5 py-0.5', codeClassName)}
                >
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter
                language={language}
                style={oneDark}
                wrapLongLines
                showLineNumbers={false}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  padding: '0.9rem',
                  fontSize: '0.78rem',
                  textAlign: 'left',
                  tabSize: 2,
                }}
              >
                {code}
              </SyntaxHighlighter>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
};

export default GitHubReadme;
