import {
  createRepositoryBranch,
  getRepositoryFileContent,
  getRepositoryFilesAtCommit,
  listRepositoryCommits,
  listRepositoryFiles,
  uploadRepositoryFiles,
  type HubRepository,
} from '@/lib/hubApi';

type AgentRole = 'system' | 'user' | 'assistant';

type AgentMessage = {
  role: AgentRole;
  content: string;
};

export type RepoAgentMemory = {
  currentRepoId: string;
  recentFiles: string[];
};

export type RepoAgentAction = {
  tool: 'create_commit';
  args: {
    message: string;
    changes: Array<{ path: string; content: string }>;
  };
  preview: string;
  userInput: string;
};

type AgentToolName =
  | 'list_repo_files'
  | 'get_file_content'
  | 'search_code'
  | 'get_commit_history'
  | 'create_commit'
  | 'create_branch'
  | 'get_diff';

type AgentToolCall = {
  type: 'tool_call';
  tool: AgentToolName;
  args: Record<string, unknown>;
  reason?: string;
};

type AgentFinal = {
  type: 'final';
  response: string;
  steps: string[];
};

type AgentDecision = AgentToolCall | AgentFinal;

export type RepoAgentResult =
  | {
      kind: 'final';
      response: string;
      steps: string[];
      memory: RepoAgentMemory;
    }
  | {
      kind: 'confirmation_required';
      response: string;
      steps: string[];
      action: RepoAgentAction;
      memory: RepoAgentMemory;
    };

type RunAgentInput = {
  userInput: string;
  repoId: string;
  repositories: HubRepository[];
  pushableRepoIds: Set<string>;
  memory: RepoAgentMemory;
  forcedAction?: RepoAgentAction;
  signal?: AbortSignal;
};

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_FREE_MODEL = 'nvidia/nemotron-nano-9b-v2:free';
const DEFAULT_FALLBACK_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'google/gemma-4-26b-a4b-it:free',
];
const MAX_RATE_LIMIT_RETRIES_PER_MODEL = 1;
const MAX_TOOL_LOOPS = 4;
const MAX_RECENT_FILES = 12;
const MAX_TEXT_CHARS = 3500;
const MAX_FILE_FETCH_BYTES = 140000;
const MAX_SEARCH_FILES = 12;
const MAX_SEARCH_MATCHES = 18;
const SEARCH_FETCH_CONCURRENCY = 4;
const MAX_LIST_REPO_FILES = 220;
const MAX_COMMIT_HISTORY_ITEMS = 24;

const SYSTEM_PROMPT = [
  'You are an AI repository management agent.',
  'You must use tools for repository operations.',
  'Never assume file content without a tool result.',
  'Do not request the entire repository content.',
  'Use selective retrieval only.',
  'Prefer search_code and targeted get_file_content calls.',
  'Return only JSON.',
  'JSON schema:',
  '{"type":"tool_call","tool":"list_repo_files|get_file_content|search_code|get_commit_history|create_commit|create_branch|get_diff","args":{...},"reason":"short reason"}',
  'or',
  '{"type":"final","response":"natural language summary","steps":["actionable step 1","actionable step 2"]}',
  'create_commit args schema:',
  '{"message":"commit message","changes":[{"path":"relative/path.ext","content":"new full file content"}]}',
  'create_branch args schema:',
  '{"name":"branch-name"}',
  'get_file_content args schema:',
  '{"path":"relative/path.ext"}',
  'search_code args schema:',
  '{"query":"text to find"}',
  'get_diff args schema:',
  '{"commit1":"hashA","commit2":"hashB"}',
  'If a destructive write would be needed, still output tool_call for create_commit and let caller ask confirmation.',
].join('\n');

const cloneMemory = (memory: RepoAgentMemory, fallbackRepoId: string): RepoAgentMemory => ({
  currentRepoId: memory.currentRepoId || fallbackRepoId,
  recentFiles: [...(memory.recentFiles || [])],
});

const clampText = (value: string, max = MAX_TEXT_CHARS) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated]`;
};

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError');

const getAbortMessage = (signal?: AbortSignal) => {
  const reason = signal?.reason;
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  return 'AI request was cancelled.';
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  const abortError = new Error(getAbortMessage(signal));
  abortError.name = 'AbortError';
  throw abortError;
};

const pushRecentFiles = (memory: RepoAgentMemory, paths: string[]) => {
  const next = [...memory.recentFiles];
  for (const path of paths) {
    const normalized = path.trim();
    if (!normalized) continue;
    const existingIndex = next.indexOf(normalized);
    if (existingIndex !== -1) {
      next.splice(existingIndex, 1);
    }
    next.unshift(normalized);
  }
  memory.recentFiles = next.slice(0, MAX_RECENT_FILES);
};

const isValidRelativePath = (path: string) => {
  if (!path.trim()) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[a-zA-Z]:\\/.test(path)) return false;
  if (path.includes('..')) return false;
  return true;
};

const extractJsonObject = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : raw;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model response did not contain JSON object.');
  }
  return source.slice(firstBrace, lastBrace + 1);
};

const parseDecision = (raw: string): AgentDecision => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as AgentDecision;
    if (parsed.type === 'tool_call' && parsed.tool) {
      return parsed;
    }
    if (parsed.type === 'final') {
      return {
        type: 'final',
        response: parsed.response || 'No summary returned.',
        steps: Array.isArray(parsed.steps) ? parsed.steps.filter(Boolean) : [],
      };
    }
  } catch {
    // Fall back below.
  }
  return {
    type: 'final',
    response: raw.trim() || 'No response from reasoning model.',
    steps: [],
  };
};

const serializeToolResult = (toolName: AgentToolName, result: unknown) =>
  clampText(
    JSON.stringify(
      {
        tool: toolName,
        result,
      },
      null,
      2,
    ),
    MAX_TEXT_CHARS,
  );

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (retryAfter: string | null, attempt: number) => {
  const parsedSeconds = Number(retryAfter || '');
  if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
    return Math.min(parsedSeconds * 1000, 12000);
  }
  const base = 1200 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(base + jitter, 10000);
};

const summarizeOpenRouterError = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return 'Empty error response from OpenRouter.';

  try {
    const payload = JSON.parse(trimmed) as {
      error?: {
        message?: string;
        code?: string | number;
        metadata?: { raw?: string };
      };
    };
    const message = payload.error?.message || 'OpenRouter request failed.';
    const metadataRaw = payload.error?.metadata?.raw;
    const code = payload.error?.code;
    return [message, code ? `code=${code}` : '', metadataRaw || ''].filter(Boolean).join(' | ');
  } catch {
    return clampText(trimmed, 420);
  }
};

const extractAssistantContent = (
  payload: { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> },
) => {
  const choiceContent = payload.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string') {
    return choiceContent.trim();
  }
  if (Array.isArray(choiceContent)) {
    const merged = choiceContent
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    return merged;
  }
  return '';
};

const callOpenRouter = async (messages: AgentMessage[], signal?: AbortSignal) => {
  throwIfAborted(signal);
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY?.trim();
  const configuredModel = (import.meta.env.VITE_OPENROUTER_MODEL?.trim() || DEFAULT_FREE_MODEL) as string;
  const fallbackModelsFromEnv = (import.meta.env.VITE_OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const modelCandidates = Array.from(
    new Set([configuredModel, ...fallbackModelsFromEnv, ...DEFAULT_FALLBACK_MODELS]),
  );
  const siteUrl =
    import.meta.env.VITE_OPENROUTER_SITE_URL?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const siteTitle = import.meta.env.VITE_OPENROUTER_SITE_TITLE?.trim() || 'Cyberspace-X Repository Agent';
  const timeoutFromEnv = Number(import.meta.env.VITE_OPENROUTER_REQUEST_TIMEOUT_MS || '25000');
  const requestTimeoutMs = Number.isFinite(timeoutFromEnv) ? Math.max(5000, timeoutFromEnv) : 25000;

  if (!apiKey) {
    throw new Error('Missing VITE_OPENROUTER_API_KEY. Add it to your .env to use the repository agent.');
  }

  let lastErrorDetail = 'Unknown OpenRouter error.';
  const attemptedModels: string[] = [];

  for (const model of modelCandidates) {
    throwIfAborted(signal);
    attemptedModels.push(model);

    for (let retry = 0; retry <= MAX_RATE_LIMIT_RETRIES_PER_MODEL; retry += 1) {
      throwIfAborted(signal);
      const requestController = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, requestTimeoutMs);
      const abortListener = () => requestController.abort();
      signal?.addEventListener('abort', abortListener, { once: true });

      let response: Response;
      try {
        response = await fetch(OPENROUTER_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': siteUrl,
            'X-OpenRouter-Title': siteTitle,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            messages,
          }),
          signal: requestController.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          if (signal?.aborted) throwIfAborted(signal);
          if (timedOut) {
            lastErrorDetail = `Model "${model}" timed out after ${requestTimeoutMs}ms.`;
            break;
          }
        }
        throw error instanceof Error ? error : new Error('OpenRouter request failed.');
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortListener);
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = extractAssistantContent(payload);
        if (!content) {
          throw new Error(`Reasoning model "${model}" returned an empty response.`);
        }
        return content;
      }

      const detail = summarizeOpenRouterError(await response.text());
      lastErrorDetail = `Model "${model}" failed (${response.status}): ${detail}`;

      if (response.status === 401 || response.status === 403) {
        throw new Error(lastErrorDetail);
      }

      if (response.status === 429 && retry < MAX_RATE_LIMIT_RETRIES_PER_MODEL) {
        const waitMs = parseRetryAfterMs(response.headers.get('retry-after'), retry);
        await delay(waitMs);
        continue;
      }

      break;
    }
  }

  if (attemptedModels.length === 1) {
    throw new Error(`Reasoning request failed after retries. ${lastErrorDetail}`);
  }

  throw new Error(
    `Reasoning request failed after trying ${attemptedModels.length} models. ${lastErrorDetail}`,
  );
};

const computeDiffBetweenCommits = async (repoId: string, commit1: string, commit2: string) => {
  const [left, right] = await Promise.all([
    getRepositoryFilesAtCommit({ repoId, commitHash: commit1 }),
    getRepositoryFilesAtCommit({ repoId, commitHash: commit2 }),
  ]);

  const leftMap = new Map(left.map((file) => [file.path, file.content || '']));
  const rightMap = new Map(right.map((file) => [file.path, file.content || '']));
  const allPaths = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
  const changes: Array<{ path: string; status: 'added' | 'deleted' | 'modified' }> = [];

  for (const path of [...allPaths].sort((a, b) => a.localeCompare(b))) {
    const leftContent = leftMap.get(path);
    const rightContent = rightMap.get(path);
    if (leftContent === undefined && rightContent !== undefined) {
      changes.push({ path, status: 'added' });
      continue;
    }
    if (leftContent !== undefined && rightContent === undefined) {
      changes.push({ path, status: 'deleted' });
      continue;
    }
    if ((leftContent || '') !== (rightContent || '')) {
      changes.push({ path, status: 'modified' });
    }
  }

  return {
    commit1,
    commit2,
    filesCompared: allPaths.size,
    changedCount: changes.length,
    changes: changes.slice(0, 300),
    truncated: changes.length > 300,
  };
};

const buildCommitPreview = async (
  repoId: string,
  message: string,
  changes: Array<{ path: string; content: string }>,
) => {
  const existing = await listRepositoryFiles(repoId);
  const existingPaths = new Set(existing.map((file) => file.path));
  const overwrite = changes.filter((item) => existingPaths.has(item.path)).map((item) => item.path);
  const create = changes.filter((item) => !existingPaths.has(item.path)).map((item) => item.path);
  const previewLines = [
    `Commit message: ${message}`,
    `Files to update: ${changes.length}`,
    `Will overwrite: ${overwrite.length}`,
    `Will create: ${create.length}`,
  ];
  if (overwrite.length > 0) previewLines.push(`Overwrite paths: ${overwrite.slice(0, 8).join(', ')}`);
  if (create.length > 0) previewLines.push(`Create paths: ${create.slice(0, 8).join(', ')}`);
  return previewLines.join('\n');
};

const selectSearchCandidates = (
  files: Array<{ path: string; language: string }>,
  query: string,
  memory: RepoAgentMemory,
) => {
  const tokens = query
    .toLowerCase()
    .split(/[^a-zA-Z0-9_./-]+/)
    .filter((token) => token.length >= 2);
  const recentSet = new Set(memory.recentFiles);
  const scored = files.map((file) => {
    const lower = file.path.toLowerCase();
    let score = recentSet.has(file.path) ? 20 : 0;
    for (const token of tokens) {
      if (lower.includes(token)) score += 12;
      if ((file.language || '').toLowerCase().includes(token)) score += 4;
    }
    if (/\.(ts|tsx|js|jsx|py|java|go|rs|md|sql|css|html|json|yml|yaml)$/i.test(file.path)) score += 2;
    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  const positive = scored.filter((entry) => entry.score > 0).map((entry) => entry.file);
  if (positive.length >= MAX_SEARCH_FILES) return positive.slice(0, MAX_SEARCH_FILES);
  const fallback = scored.map((entry) => entry.file).slice(0, MAX_SEARCH_FILES);
  return positive.length > 0 ? [...positive, ...fallback].slice(0, MAX_SEARCH_FILES) : fallback;
};

const executeTool = async ({
  tool,
  args,
  repoId,
  memory,
  pushableRepoIds,
  signal,
}: {
  tool: AgentToolName;
  args: Record<string, unknown>;
  repoId: string;
  memory: RepoAgentMemory;
  pushableRepoIds: Set<string>;
  signal?: AbortSignal;
}) => {
  throwIfAborted(signal);
  memory.currentRepoId = repoId;
  const ensureWriteAccess = () => {
    if (!pushableRepoIds.has(repoId)) {
      throw new Error('You do not have write access to this repository.');
    }
  };

  if (tool === 'list_repo_files') {
    throwIfAborted(signal);
    const files = await listRepositoryFiles(repoId);
    return {
      repoId,
      totalFiles: files.length,
      files: files.slice(0, MAX_LIST_REPO_FILES).map((file) => ({
        path: file.path,
        language: file.language,
        sizeBytes: file.size_bytes,
      })),
      truncated: files.length > MAX_LIST_REPO_FILES,
    };
  }

  if (tool === 'get_file_content') {
    throwIfAborted(signal);
    const path = String(args.path || '').trim();
    if (!isValidRelativePath(path)) {
      throw new Error('Invalid file path.');
    }
    const file = await getRepositoryFileContent(repoId, path);
    pushRecentFiles(memory, [path]);
    return {
      path: file.path,
      language: file.language,
      sizeBytes: file.size_bytes,
      content: clampText(file.content || ''),
      truncated: (file.content || '').length > MAX_TEXT_CHARS,
    };
  }

  if (tool === 'search_code') {
    throwIfAborted(signal);
    const query = String(args.query || '').trim();
    if (!query) {
      throw new Error('query is required.');
    }
    const files = await listRepositoryFiles(repoId);
    const candidateFiles = selectSearchCandidates(
      files.map((file) => ({ path: file.path, language: file.language })),
      query,
      memory,
    );

    const lowered = query.toLowerCase();
    const matches: Array<{ path: string; snippet: string }> = [];
    let bytesRead = 0;
    let scannedFiles = 0;

    for (let index = 0; index < candidateFiles.length; index += SEARCH_FETCH_CONCURRENCY) {
      throwIfAborted(signal);
      if (bytesRead > MAX_FILE_FETCH_BYTES || matches.length >= MAX_SEARCH_MATCHES) break;

      const batch = candidateFiles.slice(index, index + SEARCH_FETCH_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((candidate) => getRepositoryFileContent(repoId, candidate.path)),
      );

      for (const result of batchResults) {
        throwIfAborted(signal);
        if (bytesRead > MAX_FILE_FETCH_BYTES || matches.length >= MAX_SEARCH_MATCHES) break;
        if (result.status !== 'fulfilled') continue;

        const file = result.value;
        const content = file.content || '';
        bytesRead += content.length;
        scannedFiles += 1;
        const matchIndex = content.toLowerCase().indexOf(lowered);
        if (matchIndex === -1) continue;

        const start = Math.max(0, matchIndex - 120);
        const end = Math.min(content.length, matchIndex + lowered.length + 180);
        const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim();
        matches.push({
          path: file.path,
          snippet: clampText(snippet, 260),
        });
        pushRecentFiles(memory, [file.path]);
      }
    }

    return {
      query,
      totalFiles: files.length,
      candidateFiles: candidateFiles.length,
      scannedFiles,
      matches,
    };
  }

  if (tool === 'get_commit_history') {
    throwIfAborted(signal);
    const commits = await listRepositoryCommits(repoId);
    return {
      total: commits.length,
      commits: commits.slice(0, MAX_COMMIT_HISTORY_ITEMS).map((commit) => ({
        hash: commit.git_hash || '',
        parentHash: commit.parent_hash || '',
        message: commit.message,
        filesChanged: commit.files_changed,
        createdAt: commit.created_at,
      })),
      truncated: commits.length > MAX_COMMIT_HISTORY_ITEMS,
    };
  }

  if (tool === 'create_branch') {
    throwIfAborted(signal);
    ensureWriteAccess();
    const name = String(args.name || '').trim();
    if (!name) throw new Error('Branch name is required.');
    const branch = await createRepositoryBranch({ repoId, branchName: name });
    return {
      created: true,
      branch,
    };
  }

  if (tool === 'create_commit') {
    throwIfAborted(signal);
    ensureWriteAccess();
    const message = String(args.message || '').trim();
    const changes = Array.isArray(args.changes)
      ? args.changes
          .map((entry) => ({
            path: String((entry as any)?.path || '').trim(),
            content: String((entry as any)?.content || ''),
          }))
          .filter((entry) => entry.path && isValidRelativePath(entry.path))
      : [];
    if (!message) throw new Error('Commit message is required.');
    if (changes.length === 0) throw new Error('At least one valid change is required.');

    const files = changes.map(
      (entry) =>
        new File([new Blob([entry.content], { type: 'text/plain' })], entry.path, { type: 'text/plain' }),
    );
    const changedCount = await uploadRepositoryFiles({
      repoId,
      files,
      commitMessage: message,
    });
    pushRecentFiles(memory, changes.map((change) => change.path));
    return {
      committed: true,
      message,
      changedCount,
      changedPaths: changes.map((change) => change.path),
    };
  }

  if (tool === 'get_diff') {
    throwIfAborted(signal);
    const commit1 = String(args.commit1 || '').trim();
    const commit2 = String(args.commit2 || '').trim();
    if (!commit1 || !commit2) {
      throw new Error('Both commit1 and commit2 are required.');
    }
    return computeDiffBetweenCommits(repoId, commit1, commit2);
  }

  throw new Error(`Unsupported tool: ${tool}`);
};

const normalizeSteps = (steps: string[]) => {
  const cleaned = steps.map((step) => step.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ['Review the response and run the suggested tool action.'];
};

const finalFromToolError = (message: string, memory: RepoAgentMemory): RepoAgentResult => ({
  kind: 'final',
  response: message,
  steps: ['Adjust the request and run the agent again.'],
  memory,
});

export const runRepositoryAgent = async (input: RunAgentInput): Promise<RepoAgentResult> => {
  const { userInput, repoId, repositories, pushableRepoIds, forcedAction, signal } = input;
  throwIfAborted(signal);
  const memory = cloneMemory(input.memory, repoId);
  const activeRepo = repositories.find((repo) => repo.id === repoId);
  if (!activeRepo) {
    return finalFromToolError('Selected repository is not available in your current session.', memory);
  }

  const messages: AgentMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: JSON.stringify({
        session: {
          currentRepoId: repoId,
          currentRepoName: activeRepo.name,
          canWrite: pushableRepoIds.has(repoId),
          recentFiles: memory.recentFiles.slice(0, MAX_RECENT_FILES),
        },
      }),
    },
    { role: 'user', content: userInput },
  ];

  if (forcedAction) {
    try {
      throwIfAborted(signal);
      const forcedResult = await executeTool({
        tool: forcedAction.tool,
        args: forcedAction.args as unknown as Record<string, unknown>,
        repoId,
        memory,
        pushableRepoIds,
        signal,
      });
      messages.push({
        role: 'user',
        content: `Confirmed action executed.\n${serializeToolResult(forcedAction.tool, forcedResult)}`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to execute confirmed action.';
      return finalFromToolError(reason, memory);
    }
  }

  for (let loopIndex = 0; loopIndex < MAX_TOOL_LOOPS; loopIndex += 1) {
    throwIfAborted(signal);
    const raw = await callOpenRouter(messages, signal);
    const decision = parseDecision(raw);

    if (decision.type === 'final') {
      return {
        kind: 'final',
        response: decision.response,
        steps: normalizeSteps(decision.steps),
        memory,
      };
    }

    if (decision.tool === 'create_commit') {
      const message = String(decision.args.message || '').trim();
      const changes = Array.isArray(decision.args.changes)
        ? decision.args.changes
            .map((entry) => ({
              path: String((entry as any)?.path || '').trim(),
              content: String((entry as any)?.content || ''),
            }))
            .filter((entry) => entry.path && isValidRelativePath(entry.path))
        : [];

      if (!message || changes.length === 0) {
        messages.push({
          role: 'user',
          content: `Tool error for create_commit: invalid message or changes.`,
        });
        continue;
      }

      const preview = await buildCommitPreview(repoId, message, changes);
      return {
        kind: 'confirmation_required',
        response:
          'Commit action prepared. Confirm to execute this write operation, or cancel and refine the request.',
        steps: ['Review proposed files and commit message.', 'Click Confirm to execute or Cancel to abort.'],
        action: {
          tool: 'create_commit',
          args: { message, changes },
          preview,
          userInput,
        },
        memory,
      };
    }

    try {
      throwIfAborted(signal);
      const result = await executeTool({
        tool: decision.tool,
        args: decision.args || {},
        repoId,
        memory,
        pushableRepoIds,
        signal,
      });
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `Tool result:\n${serializeToolResult(decision.tool, result)}`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown tool error';
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `Tool error for ${decision.tool}: ${reason}`,
      });
    }
  }

  return {
    kind: 'final',
    response: 'Agent loop limit reached before a final answer.',
    steps: ['Narrow the request and try again.', 'Ask for one operation at a time.'],
    memory,
  };
};
