import { useState } from 'react';
import { GitBranch, GitMerge, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type BranchInfo = {
  name: string;
  targetHash: string;
  updatedAt: string;
};

type BranchSelectorProps = {
  branches: BranchInfo[];
  activeBranch: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, fromBranch: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
  onMergeBranch: (source: string, target: string) => Promise<void>;
  disabled?: boolean;
};

const BranchSelector = ({
  branches,
  activeBranch,
  onBranchChange,
  onCreateBranch,
  onDeleteBranch,
  onMergeBranch,
  disabled,
}: BranchSelectorProps) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');

  const handleCreate = async () => {
    if (!newBranchName.trim()) return;
    setIsBusy(true);
    setStatus('');
    try {
      await onCreateBranch(newBranchName.trim(), activeBranch);
      setNewBranchName('');
      setIsCreateOpen(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to create branch.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeSource) return;
    setIsBusy(true);
    setStatus('');
    try {
      await onMergeBranch(mergeSource, activeBranch);
      setIsMergeOpen(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to merge branch.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (branchName: string) => {
    if (branchName === 'main') return;
    setIsBusy(true);
    try {
      await onDeleteBranch(branchName);
    } catch {
      // silently fail
    } finally {
      setIsBusy(false);
    }
  };

  const otherBranches = branches.filter((b) => b.name !== activeBranch);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled || branches.length === 0}>
              <GitBranch className="h-4 w-4 mr-2" />
              {activeBranch || 'main'}
              {branches.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({branches.length} branch{branches.length !== 1 ? 'es' : ''})
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                onSelect={() => onBranchChange(branch.name)}
                className={branch.name === activeBranch ? 'bg-primary/10 font-medium' : ''}
              >
                <GitBranch className="h-4 w-4 mr-2" />
                <span className="flex-1 truncate">{branch.name}</span>
                {branch.name === activeBranch && (
                  <span className="text-[10px] uppercase text-primary ml-2">current</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Branch
            </DropdownMenuItem>
            {otherBranches.length > 0 && (
              <DropdownMenuItem onSelect={() => { setMergeSource(otherBranches[0]?.name || ''); setIsMergeOpen(true); }}>
                <GitMerge className="h-4 w-4 mr-2" />
                Merge into {activeBranch}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {branches.length > 1 && activeBranch !== 'main' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete(activeBranch)}
            disabled={isBusy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Create Branch Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from <span className="font-medium text-foreground">{activeBranch}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="feature/my-branch"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            />
            {status && <p className="text-sm text-destructive">{status}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={isBusy || !newBranchName.trim()}>
              {isBusy ? 'Creating...' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Branch Dialog */}
      <Dialog open={isMergeOpen} onOpenChange={setIsMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Branch</DialogTitle>
            <DialogDescription>
              Merge a branch into <span className="font-medium text-foreground">{activeBranch}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select
              value={mergeSource}
              onChange={(e) => setMergeSource(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {otherBranches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            {status && <p className="text-sm text-destructive">{status}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMergeOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleMerge()} disabled={isBusy || !mergeSource}>
              {isBusy ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BranchSelector;
