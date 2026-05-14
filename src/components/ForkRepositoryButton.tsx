import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, GitFork } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { forkRepository, type ForkBranchMode } from '@/lib/hubApi';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

type ForkRepositoryButtonProps = {
  repoId: string;
  repoName: string;
  ownerId: string;
  ownerUsername: string;
  className?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
};

const normalizeBranchSeed = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');

const ForkRepositoryButton = ({
  repoId,
  repoName,
  ownerId,
  ownerUsername,
  className,
  variant = 'outline',
  size = 'sm',
}: ForkRepositoryButtonProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [forkMode, setForkMode] = useState<ForkBranchMode>('main');
  const defaultBranchName = useMemo(
    () => `fork/${normalizeBranchSeed(repoName) || 'work'}`,
    [repoName],
  );
  const [branchName, setBranchName] = useState(defaultBranchName);

  useEffect(() => {
    setBranchName(defaultBranchName);
  }, [defaultBranchName]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    }).catch(() => {
      setCurrentUserId(null);
    });
  }, []);

  if (currentUserId && currentUserId === ownerId) {
    return null;
  }

  const handleOpen = async () => {
    const resolvedUserId = currentUserId || (isSupabaseConfigured()
      ? (await getSupabaseClient().auth.getUser()).data.user?.id ?? null
      : null);

    if (!resolvedUserId) {
      navigate('/signin');
      return;
    }
    setCurrentUserId(resolvedUserId);
    setIsDialogOpen(true);
  };

  const handleFork = async () => {
    setIsForking(true);
    try {
      const result = await forkRepository({
        sourceRepoId: repoId,
        branchMode: forkMode,
        branchName: forkMode === 'new_branch' ? branchName.trim() : undefined,
      });

      toast({
        title: 'Repository forked',
        description: result.createdBranchName
          ? `${result.repository.name} was added to your account with branch ${result.createdBranchName}.`
          : `${result.repository.name} was added to your account on the main branch.`,
      });
      setIsDialogOpen(false);
      navigate('/repository');
    } catch (error) {
      toast({
        title: 'Fork failed',
        description: error instanceof Error ? error.message : 'Unable to fork this repository right now.',
        variant: 'destructive',
      });
    } finally {
      setIsForking(false);
    }
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => void handleOpen()}>
        <GitFork className="h-4 w-4" />
        Fork
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Repository</DialogTitle>
            <DialogDescription>
              This creates a private fork of <span className="font-medium text-foreground">@{ownerUsername}/{repoName}</span> in your account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <RadioGroup value={forkMode} onValueChange={(value) => setForkMode(value as ForkBranchMode)}>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                <RadioGroupItem value="main" id={`fork-main-${repoId}`} className="mt-0.5" />
                <div className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">Fork to main branch</span>
                  <span className="block text-xs text-muted-foreground">
                    Copy the repository into your account and keep the fork on <code>main</code>.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer">
                <RadioGroupItem value="new_branch" id={`fork-branch-${repoId}`} className="mt-0.5" />
                <div className="space-y-2 w-full">
                  <div className="space-y-1">
                    <span className="block text-sm font-medium text-foreground">Fork and create a new branch</span>
                    <span className="block text-xs text-muted-foreground">
                      Copy the repository and create an extra working branch from <code>main</code>.
                    </span>
                  </div>

                  {forkMode === 'new_branch' && (
                    <div className="space-y-2">
                      <Label htmlFor={`fork-branch-name-${repoId}`}>Branch name</Label>
                      <div className="relative">
                        <GitBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={`fork-branch-name-${repoId}`}
                          value={branchName}
                          onChange={(event) => setBranchName(event.target.value)}
                          placeholder="feature/my-branch"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isForking}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleFork()} disabled={isForking}>
              {isForking ? 'Forking...' : 'Create fork'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ForkRepositoryButton;
