import { useState, useEffect } from 'react';
import { FileCode, FilePlus, FileX, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type DiffEntry = {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  oldContent: string;
  newContent: string;
};

type CommitDiffViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitHash: string;
  commitMessage: string;
  diff: DiffEntry[];
  isLoading: boolean;
};

const statusConfig = {
  added: { label: 'Added', icon: FilePlus, color: 'text-green-400', bg: 'bg-green-500/10' },
  modified: { label: 'Modified', icon: FileCode, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  deleted: { label: 'Deleted', icon: FileX, color: 'text-red-400', bg: 'bg-red-500/10' },
};

/* ------------------------------------------------------------------ */
/*  Language detection for syntax highlighting in added/deleted views  */
/* ------------------------------------------------------------------ */
const extensionToLanguage: Record<string, string> = {
  ts: 'tsx', tsx: 'tsx', js: 'jsx', jsx: 'jsx',
  json: 'json', html: 'html', css: 'css', scss: 'scss',
  md: 'markdown', py: 'python', java: 'java', c: 'c',
  cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust',
  sql: 'sql', yml: 'yaml', yaml: 'yaml', xml: 'xml',
  sh: 'bash', txt: 'text',
};

const detectLang = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return extensionToLanguage[ext] || 'text';
};

/* ------------------------------------------------------------------ */
/*  Diff line types                                                    */
/* ------------------------------------------------------------------ */
type DiffLineType = 'context' | 'add' | 'remove' | 'modify-old' | 'modify-new' | 'separator';

type DiffLine = {
  type: DiffLineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
  skippedCount?: number;
};

/* ------------------------------------------------------------------ */
/*  Content normalisation — strips \r, trailing whitespace, BOM etc.  */
/* ------------------------------------------------------------------ */
const normalizeForDiff = (raw: string): string[] => {
  // Normalise line endings: \r\n → \n, lone \r → \n
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip trailing whitespace from each line for comparison
  return normalized.split('\n').map((line) => line.trimEnd());
};

/* ------------------------------------------------------------------ */
/*  LCS-based diff — only runs for "modified" files                   */
/* ------------------------------------------------------------------ */
const computeLineDiff = (oldContent: string, newContent: string): DiffLine[] => {
  const oldLines = normalizeForDiff(oldContent);
  const newLines = normalizeForDiff(newContent);

  // Strip common trailing empty lines (e.g. extra newline at end of file)
  while (oldLines.length > 0 && newLines.length > 0 && oldLines[oldLines.length - 1] === '' && newLines[newLines.length - 1] === '') {
    oldLines.pop();
    newLines.pop();
  }

  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, use the simple fallback
  if (m > 800 || n > 800) {
    return collapseContext(computeSimpleDiff(oldLines, newLines));
  }

  // Build LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce raw diff operations
  type RawOp = { type: 'equal' | 'delete' | 'insert'; oldIdx?: number; newIdx?: number };
  const ops: RawOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: 'equal', oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', newIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: 'delete', oldIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();

  // Convert raw ops into DiffLines, pairing adjacent delete+insert as modifications
  const rawLines: DiffLine[] = [];
  let opIdx = 0;
  while (opIdx < ops.length) {
    const op = ops[opIdx];

    if (op.type === 'equal') {
      rawLines.push({
        type: 'context',
        content: oldLines[op.oldIdx!],
        oldLineNo: op.oldIdx! + 1,
        newLineNo: op.newIdx! + 1,
      });
      opIdx++;
    } else if (op.type === 'delete') {
      const deletes: RawOp[] = [];
      while (opIdx < ops.length && ops[opIdx].type === 'delete') {
        deletes.push(ops[opIdx]);
        opIdx++;
      }
      const inserts: RawOp[] = [];
      while (opIdx < ops.length && ops[opIdx].type === 'insert') {
        inserts.push(ops[opIdx]);
        opIdx++;
      }

      const pairCount = Math.min(deletes.length, inserts.length);
      for (let p = 0; p < pairCount; p++) {
        rawLines.push({ type: 'modify-old', content: oldLines[deletes[p].oldIdx!], oldLineNo: deletes[p].oldIdx! + 1 });
        rawLines.push({ type: 'modify-new', content: newLines[inserts[p].newIdx!], newLineNo: inserts[p].newIdx! + 1 });
      }
      for (let p = pairCount; p < deletes.length; p++) {
        rawLines.push({ type: 'remove', content: oldLines[deletes[p].oldIdx!], oldLineNo: deletes[p].oldIdx! + 1 });
      }
      for (let p = pairCount; p < inserts.length; p++) {
        rawLines.push({ type: 'add', content: newLines[inserts[p].newIdx!], newLineNo: inserts[p].newIdx! + 1 });
      }
    } else {
      rawLines.push({ type: 'add', content: newLines[op.newIdx!], newLineNo: op.newIdx! + 1 });
      opIdx++;
    }
  }

  return collapseContext(rawLines);
};

/** Fallback simple diff for very large files */
const computeSimpleDiff = (oldLinesRaw: string[], newLinesRaw: string[]): DiffLine[] => {
  // Normalise each line for accurate comparison
  const oldLines = oldLinesRaw.map((l) => l.trimEnd());
  const newLines = newLinesRaw.map((l) => l.trimEnd());
  const rawLines: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
      rawLines.push({ type: 'context', content: oldLines[oldIdx], oldLineNo: oldIdx + 1, newLineNo: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else if (oldIdx < oldLines.length && newIdx < newLines.length) {
      rawLines.push({ type: 'modify-old', content: oldLines[oldIdx], oldLineNo: oldIdx + 1 });
      rawLines.push({ type: 'modify-new', content: newLines[newIdx], newLineNo: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else if (oldIdx < oldLines.length) {
      rawLines.push({ type: 'remove', content: oldLines[oldIdx], oldLineNo: oldIdx + 1 });
      oldIdx++;
    } else {
      rawLines.push({ type: 'add', content: newLines[newIdx], newLineNo: newIdx + 1 });
      newIdx++;
    }
    if (rawLines.length > 1500) break;
  }
  return rawLines;
};

/**
 * Collapse unchanged (context) lines into small separator rows.
 * Shows 1 context line at boundaries of changed blocks for orientation.
 */
const collapseContext = (rawLines: DiffLine[]): DiffLine[] => {
  const result: DiffLine[] = [];
  let contextBuffer: DiffLine[] = [];

  const flushContext = (isLast: boolean) => {
    if (contextBuffer.length === 0) return;
    if (contextBuffer.length <= 3) {
      // Very few context lines → keep all for orientation
      result.push(...contextBuffer);
    } else {
      // Keep first line (after prev change) and last line (before next change)
      if (result.length > 0) {
        result.push(contextBuffer[0]);
      }
      const kept = (result.length > 0 ? 1 : 0) + (isLast ? 0 : 1);
      const skipped = contextBuffer.length - kept;
      if (skipped > 0) {
        result.push({ type: 'separator', content: '', skippedCount: skipped });
      }
      if (!isLast) {
        result.push(contextBuffer[contextBuffer.length - 1]);
      }
    }
    contextBuffer = [];
  };

  for (const line of rawLines) {
    if (line.type === 'context') {
      contextBuffer.push(line);
    } else {
      flushContext(false);
      result.push(line);
    }
  }
  flushContext(true);

  return result;
};

/* ------------------------------------------------------------------ */
/*  Visual style map per line type                                     */
/* ------------------------------------------------------------------ */
const lineStyles: Record<DiffLineType, { bg: string; border: string; sign: string; signColor: string; textColor: string }> = {
  add:          { bg: 'rgba(34, 197, 94, 0.12)',  border: 'border-l-green-500',   sign: '+', signColor: 'text-green-400',  textColor: 'text-green-300' },
  remove:       { bg: 'rgba(239, 68, 68, 0.12)',  border: 'border-l-red-500',     sign: '−', signColor: 'text-red-400',    textColor: 'text-red-300' },
  'modify-old': { bg: 'rgba(239, 68, 68, 0.10)',  border: 'border-l-red-400',     sign: '−', signColor: 'text-red-400',    textColor: 'text-red-300/80' },
  'modify-new': { bg: 'rgba(234, 179, 8, 0.14)',  border: 'border-l-yellow-400',  sign: '~', signColor: 'text-yellow-400', textColor: 'text-yellow-200' },
  context:      { bg: 'transparent',               border: 'border-l-transparent', sign: ' ', signColor: 'text-transparent', textColor: 'text-muted-foreground' },
  separator:    { bg: 'transparent',               border: 'border-l-transparent', sign: ' ', signColor: 'text-transparent', textColor: 'text-muted-foreground' },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
const CommitDiffViewer = ({
  open,
  onOpenChange,
  commitHash,
  commitMessage,
  diff,
  isLoading,
}: CommitDiffViewerProps) => {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setExpandedFile(null);
    }
  }, [open]);

  const shortHash = commitHash.slice(0, 7);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-primary">{shortHash}</span>
            <span className="text-muted-foreground font-normal">—</span>
            <span className="truncate">{commitMessage}</span>
          </DialogTitle>
          <DialogDescription>
            {diff.length} file{diff.length !== 1 ? 's' : ''} changed
          </DialogDescription>
        </DialogHeader>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] font-mono px-1 pb-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500/50 border border-green-500/40" />
            <span className="text-green-400">Added</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/50 border border-red-500/40" />
            <span className="text-red-400">Deleted</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-500/50 border border-yellow-500/40" />
            <span className="text-yellow-400">Modified</span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading diff...</p>
          )}

          {!isLoading && diff.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No changes in this commit.</p>
          )}

          {!isLoading && diff.map((entry) => {
            const config = statusConfig[entry.status];
            const StatusIcon = config.icon;
            const isExpanded = expandedFile === entry.path;

            return (
              <div key={entry.path} className="rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedFile(isExpanded ? null : entry.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                  <StatusIcon className={`h-4 w-4 ${config.color} shrink-0`} />
                  <span className="flex-1 text-sm font-mono text-foreground truncate">{entry.path}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                </button>

                {isExpanded && (
                  <>
                    {/* ───── ADDED file: show full code with syntax highlighting, no line-by-line green ───── */}
                    {entry.status === 'added' && (
                      <div className="overflow-x-auto" style={{ background: '#0d1117' }}>
                        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/5 text-[11px] text-green-400/70">
                          <span>+</span>
                          <span>{entry.newContent.split('\n').length} lines added</span>
                        </div>
                        <SyntaxHighlighter
                          language={detectLang(entry.path)}
                          style={oneDark}
                          showLineNumbers
                          customStyle={{
                            margin: 0,
                            padding: '0.75rem',
                            background: 'rgba(34, 197, 94, 0.04)',
                            fontSize: '0.78rem',
                            lineHeight: '1.5',
                            borderLeft: '3px solid rgba(34, 197, 94, 0.3)',
                          }}
                          lineNumberStyle={{
                            minWidth: '2.5em',
                            color: 'rgba(34, 197, 94, 0.3)',
                            userSelect: 'none',
                            paddingRight: '1rem',
                          }}
                        >
                          {entry.newContent}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {/* ───── DELETED file: show full code with syntax highlighting, no line-by-line red ───── */}
                    {entry.status === 'deleted' && (
                      <div className="overflow-x-auto" style={{ background: '#0d1117' }}>
                        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/5 text-[11px] text-red-400/70">
                          <span>−</span>
                          <span>{entry.oldContent.split('\n').length} lines deleted</span>
                        </div>
                        <SyntaxHighlighter
                          language={detectLang(entry.path)}
                          style={oneDark}
                          showLineNumbers
                          customStyle={{
                            margin: 0,
                            padding: '0.75rem',
                            background: 'rgba(239, 68, 68, 0.04)',
                            fontSize: '0.78rem',
                            lineHeight: '1.5',
                            borderLeft: '3px solid rgba(239, 68, 68, 0.3)',
                            opacity: 0.7,
                          }}
                          lineNumberStyle={{
                            minWidth: '2.5em',
                            color: 'rgba(239, 68, 68, 0.3)',
                            userSelect: 'none',
                            paddingRight: '1rem',
                            textDecoration: 'line-through',
                          }}
                        >
                          {entry.oldContent}
                        </SyntaxHighlighter>
                      </div>
                    )}

                    {/* ───── MODIFIED file: only show changed lines with proper coloring ───── */}
                    {entry.status === 'modified' && (
                      <ModifiedFileDiff entry={entry} />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------------------------------------------ */
/*  Modified file diff sub-component — only changed lines visible     */
/* ------------------------------------------------------------------ */
const ModifiedFileDiff = ({ entry }: { entry: DiffEntry }) => {
  const lines = computeLineDiff(entry.oldContent, entry.newContent);

  const addCount = lines.filter((l) => l.type === 'add' || l.type === 'modify-new').length;
  const removeCount = lines.filter((l) => l.type === 'remove' || l.type === 'modify-old').length;

  return (
    <div className="overflow-x-auto" style={{ background: '#0d1117' }}>
      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/5 text-[11px] font-mono">
        {addCount > 0 && <span className="text-green-400">+{addCount}</span>}
        {removeCount > 0 && <span className="text-red-400">−{removeCount}</span>}
        <span className="text-muted-foreground/50">
          Only changed lines are shown
        </span>
      </div>

      <table className="w-full text-xs font-mono border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === 'separator') {
              return (
                <tr key={idx}>
                  <td
                    colSpan={4}
                    className="text-center text-[11px] text-muted-foreground/50 py-1 select-none"
                    style={{
                      background: 'rgba(88, 166, 255, 0.04)',
                      borderTop: '1px solid rgba(88, 166, 255, 0.08)',
                      borderBottom: '1px solid rgba(88, 166, 255, 0.08)',
                    }}
                  >
                    ⋯ {line.skippedCount} unchanged line{line.skippedCount !== 1 ? 's' : ''} ⋯
                  </td>
                </tr>
              );
            }

            const style = lineStyles[line.type];

            return (
              <tr key={idx} style={{ background: style.bg }} className={`border-l-2 ${style.border}`}>
                {/* Old line number */}
                <td className="w-12 text-right pr-2 pl-3 py-[2px] text-muted-foreground/40 select-none border-r border-white/5 tabular-nums">
                  {(line.type === 'remove' || line.type === 'modify-old' || line.type === 'context')
                    ? (line.oldLineNo || '')
                    : ''}
                </td>
                {/* New line number */}
                <td className="w-12 text-right pr-2 pl-2 py-[2px] text-muted-foreground/40 select-none border-r border-white/5 tabular-nums">
                  {(line.type === 'add' || line.type === 'modify-new' || line.type === 'context')
                    ? (line.newLineNo || '')
                    : ''}
                </td>
                {/* Sign column */}
                <td className={`w-6 text-center py-[2px] select-none ${style.signColor} font-bold`}>
                  {style.sign !== ' ' ? style.sign : ''}
                </td>
                {/* Content */}
                <td className={`px-3 py-[2px] whitespace-pre-wrap break-all ${style.textColor}`}>
                  {line.content || '\u00A0'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CommitDiffViewer;
