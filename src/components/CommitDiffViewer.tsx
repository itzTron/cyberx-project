import { useState, useEffect } from 'react';
import { FileCode, FilePlus, FileX, X } from 'lucide-react';

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

const computeLineDiff = (oldContent: string, newContent: string) => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: Array<{ type: 'context' | 'add' | 'remove'; content: string; lineNo: number }> = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
      lines.push({ type: 'context', content: oldLines[oldIdx], lineNo: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else {
      if (oldIdx < oldLines.length) {
        lines.push({ type: 'remove', content: oldLines[oldIdx], lineNo: oldIdx + 1 });
        oldIdx++;
      }
      if (newIdx < newLines.length) {
        lines.push({ type: 'add', content: newLines[newIdx], lineNo: newIdx + 1 });
        newIdx++;
      }
    }

    if (lines.length > 500) {
      lines.push({ type: 'context', content: `... (${maxLen - lines.length} more lines)`, lineNo: 0 });
      break;
    }
  }

  return lines;
};

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
            const lines = isExpanded ? computeLineDiff(entry.oldContent, entry.newContent) : [];

            return (
              <div key={entry.path} className="rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedFile(isExpanded ? null : entry.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <StatusIcon className={`h-4 w-4 ${config.color}`} />
                  <span className="flex-1 text-sm font-mono text-foreground truncate">{entry.path}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto bg-background">
                    <table className="w-full text-xs font-mono">
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr
                            key={idx}
                            className={
                              line.type === 'add'
                                ? 'bg-green-500/10'
                                : line.type === 'remove'
                                  ? 'bg-red-500/10'
                                  : ''
                            }
                          >
                            <td className="w-12 text-right pr-3 pl-3 py-0.5 text-muted-foreground select-none border-r border-border">
                              {line.lineNo || ''}
                            </td>
                            <td className="w-6 text-center py-0.5 select-none">
                              {line.type === 'add' && <span className="text-green-400">+</span>}
                              {line.type === 'remove' && <span className="text-red-400">−</span>}
                            </td>
                            <td className="px-3 py-0.5 whitespace-pre-wrap break-all">
                              {line.content || '\u00A0'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

export default CommitDiffViewer;
