import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  Code,
  Diff,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitCommitHorizontal,
  Github,
  Globe,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  PlusCircle,
  RefreshCw,
  Rocket,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import GitHubReadme from '@/components/GitHubReadme';
import BranchSelector, { type BranchInfo } from '@/components/BranchSelector';
import CommitDiffViewer, { type DiffEntry } from '@/components/CommitDiffViewer';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  createRepository,
  createRepositoryBranch,
  deleteRepository,
  deleteRepositoryBranch,
  getDashboardBootstrap,
  getRepositoryBranches,
  getRepositoryCommitDiff,
  getRepositoryFileContent,
  listActivityLogs,
  listPushableRepositories,
  listRepositories,
  listRepositoryCommits,
  listRepositoryFiles,
  mergeRepositoryBranch,
  setRepositoryArchiveState,
  signOutDashboardUser,
  updateRepositoryVisibility,
  updateRepositoryToolListVisibility,
  uploadRepositoryFiles,
  type DashboardBootstrap,
  type HubActivityLog,
  type HubRepository,
  type HubRepositoryCommit,
  type HubRepositoryFile,
  type RepositoryVisibility,
  importGitHubRepository,
} from '@/lib/hubApi';
import {
  hasGitHubToken,
  fetchGitHubRepos,
  fetchGitHubRepoReadme,
  type GitHubRepo,
} from '@/lib/githubApi';
import { signInWithGitHub } from '@/lib/authApi';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getSyntaxLanguage = (language: string) => {
  if ((language || '').startsWith('binary:')) return 'text';
  switch (language) {
    case 'typescript': return 'tsx';
    case 'javascript': return 'jsx';
    case 'shell': return 'bash';
    case 'plaintext': return 'text';
    default: return language || 'text';
  }
};

const getBinaryMimeType = (language: string) => {
  if (!language.startsWith('binary:')) return '';
  return language.slice('binary:'.length);
};

const isAbsoluteAssetSource = (source: string) => {
  const value = source.trim().toLowerCase();
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('#')
  );
};

const stripQueryAndHash = (value: string) => value.split('#')[0].split('?')[0];

const normalizeRepoPath = (value: string) => {
  const parts = value.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    const token = part.trim();
    if (!token || token === '.') continue;
    if (token === '..') { stack.pop(); continue; }
    stack.push(token);
  }
  return stack.join('/');
};

const getDirectoryPath = (filePath: string) => {
  const normalized = normalizeRepoPath(filePath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
};

const resolveRepoRelativePath = (currentFilePath: string, source: string) => {
  const cleanSource = stripQueryAndHash(source.trim());
  if (!cleanSource) return '';
  if (cleanSource.startsWith('/')) return normalizeRepoPath(cleanSource.slice(1));
  const baseDir = getDirectoryPath(currentFilePath);
  return normalizeRepoPath(baseDir ? `${baseDir}/${cleanSource}` : cleanSource);
};

const collectReadmeAssetSources = (markdown: string) => {
  const sources = new Set<string>();
  const markdownImageRegex = /!\[[^\]]*]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
  const htmlImageRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  for (const match of markdown.matchAll(markdownImageRegex)) {
    const rawTarget = (match[1] || '').trim();
    const cleanedTarget = rawTarget.replace(/^<|>$/g, '').replace(/\s+"[^"]*"$/, '').trim();
    if (cleanedTarget) sources.add(cleanedTarget);
  }
  for (const match of markdown.matchAll(htmlImageRegex)) {
    const target = (match[1] || '').trim();
    if (target) sources.add(target);
  }
  return Array.from(sources);
};

const getRepoFileCacheKey = (repoId: string, filePath: string) => `${repoId}::${normalizeRepoPath(filePath)}`;

const repoTabs = new Set(['overview', 'create', 'upload', 'viewer', 'github']);

/* ------------------------------------------------------------------ */
/*  GitHub Import Tab (sub-component)                                  */
/* ------------------------------------------------------------------ */

type GitHubImportTabProps = {
  githubRepos: GitHubRepo[];
  setGithubRepos: React.Dispatch<React.SetStateAction<GitHubRepo[]>>;
  isGithubLoading: boolean;
  setIsGithubLoading: React.Dispatch<React.SetStateAction<boolean>>;
  githubError: string;
  setGithubError: React.Dispatch<React.SetStateAction<string>>;
  githubSearch: string;
  setGithubSearch: React.Dispatch<React.SetStateAction<string>>;
  importingRepoId: number | null;
  setImportingRepoId: React.Dispatch<React.SetStateAction<number | null>>;
  githubImportStatus: string;
  setGithubImportStatus: React.Dispatch<React.SetStateAction<string>>;
  githubFetchedRef: React.MutableRefObject<boolean>;
  refreshRepositories: () => Promise<any>;
  refreshActivity: () => Promise<void>;
};

const GitHubImportTab = ({
  githubRepos,
  setGithubRepos,
  isGithubLoading,
  setIsGithubLoading,
  githubError,
  setGithubError,
  githubSearch,
  setGithubSearch,
  importingRepoId,
  setImportingRepoId,
  githubImportStatus,
  setGithubImportStatus,
  githubFetchedRef,
  refreshRepositories,
  refreshActivity,
}: GitHubImportTabProps) => {
  const tokenAvailable = hasGitHubToken();

  const loadGitHubRepos = useCallback(async () => {
    setIsGithubLoading(true);
    setGithubError('');
    try {
      const repos = await fetchGitHubRepos();
      setGithubRepos(repos);
      githubFetchedRef.current = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch GitHub repos.';
      setGithubError(msg);
    } finally {
      setIsGithubLoading(false);
    }
  }, [setGithubRepos, setIsGithubLoading, setGithubError, githubFetchedRef]);

  // Auto-fetch on mount if token is available and hasn't fetched yet
  useEffect(() => {
    if (tokenAvailable && !githubFetchedRef.current && githubRepos.length === 0 && !isGithubLoading) {
      void loadGitHubRepos();
    }
  }, [tokenAvailable, githubRepos.length, isGithubLoading, loadGitHubRepos]);

  const filteredGithubRepos = useMemo(
    () =>
      githubRepos.filter((r) => {
        const q = githubSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.language || '').toLowerCase().includes(q)
        );
      }),
    [githubRepos, githubSearch],
  );

  const handleImportRepo = async (repo: GitHubRepo) => {
    setImportingRepoId(repo.id);
    setGithubImportStatus('');
    try {
      const readmeContent = await fetchGitHubRepoReadme(repo.owner.login, repo.name);
      await importGitHubRepository({
        name: repo.name,
        description: repo.description || '',
        githubUrl: repo.html_url,
        visibility: repo.private ? 'private' : 'public',
        readmeContent,
      });
      setGithubImportStatus(`✓ Successfully imported "${repo.name}".`);
      await refreshRepositories();
      await refreshActivity();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed.';
      setGithubImportStatus(msg);
    } finally {
      setImportingRepoId(null);
    }
  };

  const handleConnectGitHub = async () => {
    try {
      await signInWithGitHub();
    } catch {
      setGithubError('Unable to connect GitHub. Please try again.');
    }
  };

  /* No GitHub token — show connect prompt */
  if (!tokenAvailable) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5 text-center">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
            <Github className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground mb-2">Connect your GitHub account</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Sign in with GitHub to import your repositories into Cyberspace-X Hub.
              Your GitHub token is only stored for this browser session.
            </p>
          </div>
          <Button onClick={handleConnectGitHub} className="gap-2">
            <Github className="h-4 w-4" />
            Connect GitHub
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Header + Search */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Github className="h-5 w-5 text-primary" />
                Your GitHub Repositories
              </CardTitle>
              <CardDescription>
                {githubRepos.length > 0
                  ? `${githubRepos.length} repositories found`
                  : 'Fetching your repositories...'}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadGitHubRepos}
              disabled={isGithubLoading}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-4 w-4', isGithubLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="github-repo-search"
              placeholder="Search GitHub repositories..."
              value={githubSearch}
              onChange={(e) => setGithubSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {githubError && (
            <p className="text-sm text-destructive mb-4">{githubError}</p>
          )}
          {githubImportStatus && (
            <p className={cn(
              'text-sm mb-4',
              githubImportStatus.startsWith('✓') ? 'text-primary' : 'text-destructive',
            )}>
              {githubImportStatus}
            </p>
          )}

          {/* Loading skeleton */}
          {isGithubLoading && githubRepos.length === 0 && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-3 bg-muted rounded w-2/3 mb-2" />
                  <div className="flex gap-3 mt-3">
                    <div className="h-3 bg-muted rounded w-16" />
                    <div className="h-3 bg-muted rounded w-12" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isGithubLoading && githubRepos.length === 0 && !githubError && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No GitHub repositories found. Make sure your GitHub account has repositories.
            </p>
          )}

          {/* Repo cards */}
          {filteredGithubRepos.length > 0 && (
            <div className="space-y-3 max-h-[600px] overflow-auto pr-1">
              {filteredGithubRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-primary hover:underline truncate"
                        >
                          {repo.full_name}
                        </a>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          repo.private
                            ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                            : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
                        )}>
                          {repo.private ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                        {repo.fork && (
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Fork
                          </span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {repo.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2.5 text-xs text-muted-foreground">
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                            {repo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {repo.stargazers_count}
                        </span>
                        <span>
                          Updated {new Date(repo.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      disabled={importingRepoId !== null}
                      onClick={() => void handleImportRepo(repo)}
                    >
                      {importingRepoId === repo.id ? (
                        <>
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          Import
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No matches */}
          {!isGithubLoading && githubRepos.length > 0 && filteredGithubRepos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No repositories match your search.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
};



const Repository = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastRepoLoadRef = useRef(0);

  const [activeTab, setActiveTab] = useState('overview');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [user, setUser] = useState<DashboardBootstrap['user'] | null>(null);
  const [repositories, setRepositories] = useState<HubRepository[]>([]);
  const [pushableRepositories, setPushableRepositories] = useState<HubRepository[]>([]);
  const [activityLogs, setActivityLogs] = useState<HubActivityLog[]>([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [repositoryFiles, setRepositoryFiles] = useState<HubRepositoryFile[]>([]);
  const [repositoryCommits, setRepositoryCommits] = useState<HubRepositoryCommit[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [selectedFileContent, setSelectedFileContent] = useState<HubRepositoryFile | null>(null);
  const repoFileListCacheRef = useRef<Record<string, HubRepositoryFile[]>>({});
  const repoFileContentCacheRef = useRef<Record<string, HubRepositoryFile>>({});
  const [readmeAssetUrls, setReadmeAssetUrls] = useState<Record<string, string>>({});
  const [isReadmeAssetLoading, setIsReadmeAssetLoading] = useState(false);
  const [repoDataError, setRepoDataError] = useState('');
  const [isRepoDataLoading, setIsRepoDataLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [createRepoName, setCreateRepoName] = useState('');
  const [createRepoDescription, setCreateRepoDescription] = useState('');
  const [createRepoVisibility, setCreateRepoVisibility] = useState<RepositoryVisibility>('private');
  const [initializeReadme, setInitializeReadme] = useState(true);
  const [createRepoStatus, setCreateRepoStatus] = useState('');
  const [isCreatingRepo, setIsCreatingRepo] = useState(false);
  const [isUpdatingRepository, setIsUpdatingRepository] = useState(false);
  const [repositoryActionStatus, setRepositoryActionStatus] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetRepository, setDeleteTargetRepository] = useState<HubRepository | null>(null);
  const [deleteRepositoryInput, setDeleteRepositoryInput] = useState('');
  const [isDeletingRepository, setIsDeletingRepository] = useState(false);
  const [uploadRepoId, setUploadRepoId] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCommitMessage, setUploadCommitMessage] = useState('Upload project files');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [activeBranch, setActiveBranch] = useState('main');
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffCommitHash, setDiffCommitHash] = useState('');
  const [diffCommitMessage, setDiffCommitMessage] = useState('');
  const [diffEntries, setDiffEntries] = useState<DiffEntry[]>([]);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [editorRepoId, setEditorRepoId] = useState('');
  const [editorFilename, setEditorFilename] = useState('');
  const [editorCode, setEditorCode] = useState('');
  const [editorCommitMessage, setEditorCommitMessage] = useState('');
  const [editorStatus, setEditorStatus] = useState('');
  const [isCommittingCode, setIsCommittingCode] = useState(false);
  const [editorFiles, setEditorFiles] = useState<HubRepositoryFile[]>([]);
  const [isEditorFilesLoading, setIsEditorFilesLoading] = useState(false);

  /* GitHub import state */
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [githubSearch, setGithubSearch] = useState('');
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null);
  const [githubImportStatus, setGithubImportStatus] = useState('');
  const githubFetchedRef = useRef(false);

  const editorDetectedLanguage = useMemo(() => {
    const ext = editorFilename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
      json: 'json', html: 'html', css: 'css', scss: 'scss',
      md: 'markdown', py: 'python', java: 'java', c: 'c',
      cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust',
      sql: 'sql', yml: 'yaml', yaml: 'yaml', xml: 'xml',
      sh: 'bash', txt: 'text', rb: 'ruby', php: 'php',
      swift: 'swift', kt: 'kotlin', dart: 'dart', r: 'r',
    };
    return langMap[ext] || (ext ? ext : 'text');
  }, [editorFilename]);

  const filteredRepositories = useMemo(
    () =>
      repositories.filter((repo) => {
        const query = repoSearch.trim().toLowerCase();
        if (!query) return true;
        return repo.name.toLowerCase().includes(query) || repo.description.toLowerCase().includes(query);
      }),
    [repositories, repoSearch],
  );

  const selectedRepository = repositories.find((repository) => repository.id === selectedRepoId) || null;

  /* ---- Tab sync with URL ---- */
  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (!tabParam || !repoTabs.has(tabParam) || tabParam === activeTab) return;
    setActiveTab(tabParam);
  }, [activeTab, location.search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === value) return;
    params.set('tab', value);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  /* ---- Data helpers ---- */
  const refreshActivity = async () => {
    try {
      const logs = await listActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      console.error(error);
    }
  };

  const refreshRepositories = async () => {
    const [repos, pushableRepos] = await Promise.all([listRepositories(), listPushableRepositories()]);
    setRepositories(repos);
    setPushableRepositories(pushableRepos);

    if (!repos.length) {
      setSelectedRepoId('');
    } else {
      setSelectedRepoId((current) => (repos.some((repo) => repo.id === current) ? current : repos[0].id));
    }

    if (!pushableRepos.length) {
      setUploadRepoId('');
      return repos;
    }

    setUploadRepoId((current) => (pushableRepos.some((repo) => repo.id === current) ? current : pushableRepos[0].id));
    return repos;
  };

  const loadRepositoryDetails = async (repoId: string, preferredPath?: string) => {
    const requestId = Date.now();
    lastRepoLoadRef.current = requestId;
    setIsRepoDataLoading(true);
    setRepoDataError('');

    try {
      const [files, commits, repoBranches] = await Promise.all([
        listRepositoryFiles(repoId),
        listRepositoryCommits(repoId),
        getRepositoryBranches(repoId).catch(() => [] as BranchInfo[]),
      ]);

      if (lastRepoLoadRef.current !== requestId) return;

      setRepositoryFiles(files);
      repoFileListCacheRef.current[repoId] = files;
      setRepositoryCommits(commits);
      setBranches(repoBranches);
      setActiveBranch(repoBranches.length > 0 ? repoBranches[0].name : 'main');

      const fallbackPath = files.find((file) => file.path.toLowerCase() === 'readme.md')?.path || files[0]?.path || '';
      const pathToLoad = preferredPath && files.some((file) => file.path === preferredPath) ? preferredPath : fallbackPath;
      setSelectedFilePath(pathToLoad);

      if (!pathToLoad) {
        setSelectedFileContent(null);
        return;
      }

      setIsFileLoading(true);
      const fileContent = await getRepositoryFileContent(repoId, pathToLoad);

      if (lastRepoLoadRef.current !== requestId) return;

      setSelectedFileContent(fileContent);
      repoFileContentCacheRef.current[getRepoFileCacheKey(repoId, pathToLoad)] = fileContent;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load repository details.';
      setRepoDataError(message);
    } finally {
      if (lastRepoLoadRef.current === requestId) {
        setIsRepoDataLoading(false);
        setIsFileLoading(false);
      }
    }
  };

  const loadFileContent = async (filePath: string) => {
    if (!selectedRepoId) return;
    setIsFileLoading(true);
    setSelectedFilePath(filePath);
    setRepoDataError('');

    try {
      const fileContent = await getRepositoryFileContent(selectedRepoId, filePath);
      setSelectedFileContent(fileContent);
      repoFileContentCacheRef.current[getRepoFileCacheKey(selectedRepoId, filePath)] = fileContent;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load file content.';
      setRepoDataError(message);
    } finally {
      setIsFileLoading(false);
    }
  };

  /* ---- Bootstrap ---- */
  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      setBootstrapError('');

      try {
        const data = await getDashboardBootstrap();
        const pushableRepos = await listPushableRepositories();
        setUser(data.user);
        setRepositories(data.repositories);
        setPushableRepositories(pushableRepos);
        setActivityLogs(data.activityLogs);

        if (data.repositories.length > 0) setSelectedRepoId(data.repositories[0].id);
        if (pushableRepos.length > 0) setUploadRepoId(pushableRepos[0].id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open repository page.';
        setBootstrapError(message);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [navigate]);

  /* ---- Load repo details when selected repo changes ---- */
  useEffect(() => {
    repoFileContentCacheRef.current = {};
    setReadmeAssetUrls({});
    setIsReadmeAssetLoading(false);

    if (!selectedRepoId) {
      setRepositoryFiles([]);
      setRepositoryCommits([]);
      setSelectedFilePath('');
      setSelectedFileContent(null);
      return;
    }

    void loadRepositoryDetails(selectedRepoId);
  }, [selectedRepoId]);

  /* ---- Resolve README image assets ---- */
  useEffect(() => {
    const activeFile = selectedFileContent;
    const activeRepoId = selectedRepoId;

    if (!activeFile || !activeRepoId) {
      setReadmeAssetUrls({});
      setIsReadmeAssetLoading(false);
      return;
    }

    const isMarkdownFile =
      !activeFile.language.startsWith('binary:') && activeFile.path.toLowerCase().endsWith('.md');

    if (!isMarkdownFile || !activeFile.content) {
      setReadmeAssetUrls({});
      setIsReadmeAssetLoading(false);
      return;
    }

    const sources = collectReadmeAssetSources(activeFile.content);
    if (!sources.length) {
      setReadmeAssetUrls({});
      setIsReadmeAssetLoading(false);
      return;
    }

    let isCancelled = false;

    const loadReadmeAssets = async () => {
      setIsReadmeAssetLoading(true);
      const resolvedSources: Record<string, string> = {};

      try {
        for (const source of sources) {
          if (isAbsoluteAssetSource(source)) {
            resolvedSources[source] = source;
            continue;
          }

          const repoPath = resolveRepoRelativePath(activeFile.path, source);
          if (!repoPath) continue;

          const matchedFile = repositoryFiles.find((file) => normalizeRepoPath(file.path) === repoPath);
          if (!matchedFile) continue;

          let fileContent = repoFileContentCacheRef.current[getRepoFileCacheKey(activeRepoId, matchedFile.path)];
          if (!fileContent) {
            fileContent = await getRepositoryFileContent(activeRepoId, matchedFile.path);
            repoFileContentCacheRef.current[getRepoFileCacheKey(activeRepoId, matchedFile.path)] = fileContent;
          }

          if (fileContent.language.startsWith('binary:image/') && (fileContent.content || '').startsWith('data:')) {
            resolvedSources[source] = fileContent.content || '';
            continue;
          }

          if (matchedFile.path.toLowerCase().endsWith('.svg') && fileContent.content) {
            resolvedSources[source] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fileContent.content)}`;
          }
        }
      } catch (error) {
        if (!isCancelled) console.error('Unable to resolve README image assets:', error);
      } finally {
        if (!isCancelled) {
          setReadmeAssetUrls(resolvedSources);
          setIsReadmeAssetLoading(false);
        }
      }
    };

    void loadReadmeAssets();
    return () => { isCancelled = true; };
  }, [repositoryFiles, selectedFileContent, selectedRepoId]);

  /* ---- Repo CRUD handlers ---- */
  const handleCreateRepository = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateRepoStatus('');
    setIsCreatingRepo(true);

    try {
      const created = await createRepository({
        name: createRepoName,
        description: createRepoDescription,
        visibility: createRepoVisibility,
        initializeWithReadme: initializeReadme,
      });

      setCreateRepoName('');
      setCreateRepoDescription('');
      setCreateRepoVisibility('private');
      setInitializeReadme(true);
      setCreateRepoStatus(`Repository "${created.name}" created.`);
      await refreshRepositories();
      await refreshActivity();
      setSelectedRepoId(created.id);
      setUploadRepoId(created.id);
      setActiveTab('overview');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create repository.';
      setCreateRepoStatus(message);
    } finally {
      setIsCreatingRepo(false);
    }
  };

  const handleRepositoryVisibilityChange = async (repo: HubRepository, visibility: RepositoryVisibility) => {
    if (repo.visibility === visibility) return;
    setIsUpdatingRepository(true);
    setRepositoryActionStatus('');

    try {
      await updateRepositoryVisibility({ repoId: repo.id, visibility });
      setRepositoryActionStatus(`Repository "${repo.name}" is now ${visibility}.`);
      await refreshRepositories();
      await refreshActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update repository visibility.';
      setRepositoryActionStatus(message);
    } finally {
      setIsUpdatingRepository(false);
    }
  };

  const handleRepositoryArchiveState = async (repo: HubRepository, archive: boolean) => {
    setIsUpdatingRepository(true);
    setRepositoryActionStatus('');

    try {
      await setRepositoryArchiveState({ repoId: repo.id, archive });
      setRepositoryActionStatus(archive ? `Repository "${repo.name}" archived.` : `Repository "${repo.name}" unarchived.`);
      await refreshRepositories();
      await refreshActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change archive state.';
      setRepositoryActionStatus(message);
    } finally {
      setIsUpdatingRepository(false);
    }
  };

  const handleRepositoryToolListState = async (repo: HubRepository, showInToolList: boolean) => {
    if (showInToolList && repo.visibility !== 'public') {
      setRepositoryActionStatus('Make the repository public before publishing it to the public tool list.');
      return;
    }

    setIsUpdatingRepository(true);
    setRepositoryActionStatus('');

    try {
      await updateRepositoryToolListVisibility({ repoId: repo.id, showInToolList });
      setRepositoryActionStatus(
        showInToolList
          ? `Repository "${repo.name}" is now listed on the public tool list.`
          : `Repository "${repo.name}" was removed from the public tool list.`,
      );
      await refreshRepositories();
      await refreshActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update public tool list visibility.';
      setRepositoryActionStatus(message);
    } finally {
      setIsUpdatingRepository(false);
    }
  };

  const openDeleteDialog = (repo: HubRepository) => {
    setDeleteTargetRepository(repo);
    setDeleteRepositoryInput('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteRepository = async () => {
    if (!deleteTargetRepository) return;
    setIsDeletingRepository(true);
    setRepositoryActionStatus('');

    try {
      await deleteRepository(deleteTargetRepository.id);
      setRepositoryActionStatus(`Repository "${deleteTargetRepository.name}" deleted.`);
      setDeleteDialogOpen(false);
      setDeleteTargetRepository(null);
      setDeleteRepositoryInput('');
      await refreshRepositories();
      await refreshActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete repository.';
      setRepositoryActionStatus(message);
    } finally {
      setIsDeletingRepository(false);
    }
  };

  const handleUploadFiles = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadStatus('');

    if (!uploadRepoId) {
      setUploadStatus('Choose a repository first.');
      return;
    }

    setIsUploading(true);

    try {
      const uploadedCount = await uploadRepositoryFiles({
        repoId: uploadRepoId,
        files: uploadFiles,
        commitMessage: uploadCommitMessage,
      });

      setUploadStatus(`Uploaded ${uploadedCount} file(s) successfully.`);
      setUploadFiles([]);
      await refreshActivity();
      await refreshRepositories();
      setSelectedRepoId(uploadRepoId);
      await loadRepositoryDetails(uploadRepoId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'File upload failed.';
      setUploadStatus(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCommitInlineCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditorStatus('');

    if (!editorRepoId) { setEditorStatus('Choose a repository first.'); return; }
    if (!editorFilename.trim()) { setEditorStatus('Enter a file name (e.g. main.py, index.ts).'); return; }
    if (!editorCode.trim()) { setEditorStatus('Write some code before committing.'); return; }

    setIsCommittingCode(true);

    try {
      const codeBlob = new Blob([editorCode], { type: 'text/plain' });
      const codeFile = new File([codeBlob], editorFilename.trim(), { type: 'text/plain' });
      const message = editorCommitMessage.trim() || `Add ${editorFilename.trim()}`;

      await uploadRepositoryFiles({ repoId: editorRepoId, files: [codeFile], commitMessage: message });

      setEditorStatus(`✓ Committed "${editorFilename.trim()}" successfully.`);
      setEditorCode('');
      setEditorFilename('');
      setEditorCommitMessage('');
      await refreshActivity();
      await refreshRepositories();
      setSelectedRepoId(editorRepoId);
      await loadRepositoryDetails(editorRepoId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to commit code.';
      setEditorStatus(msg);
    } finally {
      setIsCommittingCode(false);
    }
  };

  const handleEditorFileSelect = async (filePath: string) => {
    setEditorFilename(filePath);
    if (!filePath || !editorRepoId) return;

    const existingFile = editorFiles.find((f) => f.path === filePath);
    if (existingFile) {
      try {
        const fileContent = await getRepositoryFileContent(editorRepoId, filePath);
        if (fileContent) {
          setEditorCode(fileContent.content || '');
          setEditorCommitMessage(`Update ${filePath}`);
        }
      } catch {
        // Could not load — user can still type manually
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutDashboardUser();
      navigate('/signin');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out.';
      setBootstrapError(message);
    }
  };

  // Load files when editor repo changes
  useEffect(() => {
    if (!editorRepoId) {
      setEditorFiles([]);
      setEditorFilename('');
      setEditorCode('');
      return;
    }
    setIsEditorFilesLoading(true);
    listRepositoryFiles(editorRepoId)
      .then((files) => setEditorFiles(files))
      .catch(() => setEditorFiles([]))
      .finally(() => setIsEditorFilesLoading(false));
  }, [editorRepoId]);

  const canConfirmDelete =
    Boolean(deleteTargetRepository) && deleteRepositoryInput.trim() === deleteTargetRepository?.name;
  const resolveRepositoryReadmeAssetUrl = (source: string) => readmeAssetUrls[source] || source;

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-28 pb-12">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-3">
                  <FolderGit2 className="h-8 w-8 text-primary" />
                  Repository Manager
                </h1>
                <p className="text-muted-foreground mt-2">
                  Create, manage, and explore your repositories, upload code, and view commit history.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => void refreshRepositories()}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button variant="outline" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>

            {isBootstrapping && (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">Loading repository data...</CardContent>
              </Card>
            )}

            {!isBootstrapping && bootstrapError && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Access Required</CardTitle>
                  <CardDescription>{bootstrapError}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link to="/signin">Go to Sign In</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isBootstrapping && !bootstrapError && user && (
              <>
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="create">New Repository</TabsTrigger>
                    <TabsTrigger value="upload">Upload Code</TabsTrigger>
                    <TabsTrigger value="viewer">Show Code</TabsTrigger>
                    <TabsTrigger value="github" className="gap-1.5">
                      <Github className="h-4 w-4" />
                      Import from GitHub
                    </TabsTrigger>
                  </TabsList>

                  {/* ══════════════════════════ OVERVIEW ══════════════════════════ */}
                  <TabsContent value="overview" className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                      {/* Repository list */}
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-xl">Your Repositories</CardTitle>
                              <CardDescription>{repositories.length} repositories</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Input
                            placeholder="Search repositories..."
                            value={repoSearch}
                            onChange={(event) => setRepoSearch(event.target.value)}
                            className="mb-4"
                          />

                          {filteredRepositories.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {repositories.length === 0 ? 'No repositories yet.' : 'No matches.'}
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
                              {filteredRepositories.map((repo) =>
                                (() => {
                                  const isProtectedProfileRepo = false;
                                  return (
                                <div
                                  key={repo.id}
                                  className={`group rounded-md border p-3 transition-colors cursor-pointer ${
                                    repo.id === selectedRepoId
                                      ? 'border-primary bg-primary/5'
                                      : 'border-border hover:border-primary/50 hover:bg-muted/40'
                                  }`}
                                  onClick={() => setSelectedRepoId(repo.id)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-foreground truncate">{repo.name}</p>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${repo.visibility === 'public' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                          {repo.visibility}
                                        </span>
                                        {repo.archived_at && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">archived</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1 truncate">{repo.description || 'No description.'}</p>
                                    </div>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                          <Ellipsis className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem onSelect={() => void handleRepositoryVisibilityChange(repo, repo.visibility === 'public' ? 'private' : 'public')}>
                                          {repo.visibility === 'public' ? (
                                            <><EyeOff className="mr-2 h-4 w-4" /> Make Private</>
                                          ) : (
                                            <><Eye className="mr-2 h-4 w-4" /> Make Public</>
                                          )}
                                        </DropdownMenuItem>
                                        {repo.show_in_tool_list ? (
                                          <DropdownMenuItem onSelect={() => void handleRepositoryToolListState(repo, false)}>
                                            <Rocket className="mr-2 h-4 w-4" /> Remove from Tool List
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem disabled={repo.visibility !== 'public'} onSelect={() => void handleRepositoryToolListState(repo, true)}>
                                            <Rocket className="mr-2 h-4 w-4" /> Push to Public Tool List
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        {repo.archived_at ? (
                                          <DropdownMenuItem disabled={isProtectedProfileRepo} onSelect={(event) => { if (isProtectedProfileRepo) { event.preventDefault(); return; } void handleRepositoryArchiveState(repo, false); }}>
                                            <ArchiveRestore className="mr-2 h-4 w-4" /> Unarchive Repository
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem disabled={isProtectedProfileRepo} onSelect={(event) => { if (isProtectedProfileRepo) { event.preventDefault(); return; } void handleRepositoryArchiveState(repo, true); }}>
                                            <Archive className="mr-2 h-4 w-4" /> Archive Repository
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem disabled={isProtectedProfileRepo} onSelect={(event) => { if (isProtectedProfileRepo) { event.preventDefault(); return; } openDeleteDialog(repo); }} className="text-destructive focus:text-destructive">
                                          <Trash2 className="mr-2 h-4 w-4" /> Delete Repository
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                  );
                                })()
                              )}
                            </div>
                          )}

                          {repositoryActionStatus && <p className="text-sm text-muted-foreground">{repositoryActionStatus}</p>}
                        </CardContent>
                      </Card>

                      {/* Repository Files */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-xl flex items-center gap-2">
                            <FolderGit2 className="h-5 w-5 text-primary" />
                            Repository Files
                          </CardTitle>
                          <CardDescription>
                            {selectedRepository ? `Files in ${selectedRepository.name}` : 'Select a repository'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {isRepoDataLoading ? (
                            <p className="text-sm text-muted-foreground">Loading files...</p>
                          ) : repositoryFiles.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {repositoryFiles.slice(0, 10).map((file) => (
                                <button
                                  key={file.id}
                                  type="button"
                                  onClick={() => {
                                    void loadFileContent(file.path);
                                    setActiveTab('viewer');
                                  }}
                                  className="w-full rounded-md border border-border p-2 text-left hover:border-primary/50 hover:bg-muted/40"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm text-foreground truncate">{file.path}</p>
                                    <p className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Commit History */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                              <GitCommitHorizontal className="h-5 w-5 text-primary" />
                              Commit History
                            </CardTitle>
                            <CardDescription>Latest commits for the selected repository.</CardDescription>
                          </div>
                          {selectedRepoId && (
                            <BranchSelector
                              branches={branches}
                              activeBranch={activeBranch}
                              onBranchChange={(branch) => setActiveBranch(branch)}
                              onCreateBranch={async (name, from) => {
                                await createRepositoryBranch({ repoId: selectedRepoId, branchName: name, fromBranch: from });
                                const updated = await getRepositoryBranches(selectedRepoId);
                                setBranches(updated);
                              }}
                              onDeleteBranch={async (name) => {
                                await deleteRepositoryBranch({ repoId: selectedRepoId, branchName: name });
                                const updated = await getRepositoryBranches(selectedRepoId);
                                setBranches(updated);
                                if (activeBranch === name) setActiveBranch('main');
                              }}
                              onMergeBranch={async (source, target) => {
                                await mergeRepositoryBranch({ repoId: selectedRepoId, sourceBranch: source, targetBranch: target });
                                const updated = await getRepositoryBranches(selectedRepoId);
                                setBranches(updated);
                              }}
                            />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {repositoryCommits.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No commits yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {repositoryCommits.slice(0, 10).map((commit) => (
                              <div key={commit.id} className="rounded-md border border-border p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">{commit.message}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {commit.git_hash && (
                                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                          {commit.git_hash.slice(0, 7)}
                                        </span>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        Files changed: {commit.files_changed}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatDateTime(commit.created_at)}
                                      </span>
                                    </div>
                                  </div>
                                  {commit.git_hash && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={() => {
                                        const hash = commit.git_hash!;
                                        setDiffCommitHash(hash);
                                        setDiffCommitMessage(commit.message);
                                        setDiffDialogOpen(true);
                                        setIsDiffLoading(true);
                                        setDiffEntries([]);
                                        getRepositoryCommitDiff({ repoId: selectedRepoId, commitHash: hash })
                                          .then((entries) => setDiffEntries(entries))
                                          .catch(() => setDiffEntries([]))
                                          .finally(() => setIsDiffLoading(false));
                                      }}
                                    >
                                      <Diff className="h-3.5 w-3.5 mr-1" />
                                      Diff
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <CommitDiffViewer
                      open={diffDialogOpen}
                      onOpenChange={setDiffDialogOpen}
                      commitHash={diffCommitHash}
                      commitMessage={diffCommitMessage}
                      diff={diffEntries}
                      isLoading={isDiffLoading}
                    />
                  </TabsContent>

                  {/* ══════════════════════════ CREATE ══════════════════════════ */}
                  <TabsContent value="create">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                          <PlusCircle className="h-5 w-5 text-primary" />
                          Create New Repository
                        </CardTitle>
                        <CardDescription>
                          Create public or private repositories with optional README initialization.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCreateRepository} className="space-y-4">
                          <div>
                            <label htmlFor="repo-name" className="block text-sm text-foreground mb-2">Repository Name</label>
                            <Input id="repo-name" value={createRepoName} onChange={(event) => setCreateRepoName(event.target.value)} placeholder="my-awesome-project" required />
                          </div>

                          <div>
                            <label htmlFor="repo-description" className="block text-sm text-foreground mb-2">Description</label>
                            <Textarea id="repo-description" value={createRepoDescription} onChange={(event) => setCreateRepoDescription(event.target.value)} placeholder="Briefly describe your project." className="min-h-[100px]" />
                          </div>

                          <div>
                            <label htmlFor="repo-visibility" className="block text-sm text-foreground mb-2">Visibility</label>
                            <select id="repo-visibility" value={createRepoVisibility} onChange={(event) => setCreateRepoVisibility(event.target.value as RepositoryVisibility)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                              <option value="private">Private</option>
                              <option value="public">Public</option>
                            </select>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <input type="checkbox" checked={initializeReadme} onChange={(event) => setInitializeReadme(event.target.checked)} />
                            Initialize this repository with README.md
                          </label>

                          {createRepoStatus && <p className="text-sm text-muted-foreground">{createRepoStatus}</p>}

                          <Button type="submit" disabled={isCreatingRepo}>
                            {isCreatingRepo ? 'Creating...' : 'Create Repository'}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ══════════════════════════ UPLOAD ══════════════════════════ */}
                  <TabsContent value="upload">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                          <Upload className="h-5 w-5 text-primary" />
                          Upload Project Files
                        </CardTitle>
                        <CardDescription>Upload source files and create a commit entry.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleUploadFiles} className="space-y-4">
                          <div>
                            <label htmlFor="upload-repo" className="block text-sm text-foreground mb-2">Repository</label>
                            <select id="upload-repo" value={uploadRepoId} onChange={(event) => setUploadRepoId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                              <option value="">Select repository</option>
                              {pushableRepositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>{repo.name} ({repo.visibility})</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="upload-files" className="block text-sm text-foreground mb-2">Code Files</label>
                            <Input id="upload-files" type="file" multiple onChange={(event) => setUploadFiles(Array.from(event.target.files || []))} />
                            {uploadFiles.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">{uploadFiles.length} file(s) selected.</p>
                            )}
                          </div>

                          <div>
                            <label htmlFor="commit-message" className="block text-sm text-foreground mb-2">Commit Message</label>
                            <Input id="commit-message" value={uploadCommitMessage} onChange={(event) => setUploadCommitMessage(event.target.value)} />
                          </div>

                          {uploadStatus && <p className="text-sm text-muted-foreground">{uploadStatus}</p>}

                          <Button type="submit" disabled={isUploading}>
                            {isUploading ? 'Uploading...' : 'Upload & Commit'}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>

                    {/* CodeFile inline editor */}
                    <Card className="mt-6">
                      <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                          <Code className="h-5 w-5 text-primary" />
                          CodeFile
                        </CardTitle>
                        <CardDescription>
                          Edit existing files or create new ones. Auto-detects language and commits to repository.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleCommitInlineCode} className="space-y-4">
                          <div>
                            <label htmlFor="editor-repo" className="block text-sm text-foreground mb-2">Repository</label>
                            <select id="editor-repo" value={editorRepoId} onChange={(e) => setEditorRepoId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                              <option value="">Select repository</option>
                              {pushableRepositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>{repo.name} ({repo.visibility})</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="editor-filename" className="block text-sm text-foreground mb-2">
                              File Name
                              {editorFiles.length > 0 && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({editorFiles.length} existing file{editorFiles.length !== 1 ? 's' : ''})
                                </span>
                              )}
                            </label>
                            {isEditorFilesLoading ? (
                              <p className="text-xs text-muted-foreground">Loading files...</p>
                            ) : editorFiles.length > 0 ? (
                              <div className="space-y-2">
                                <select
                                  value={editorFiles.some((f) => f.path === editorFilename) ? editorFilename : '__new__'}
                                  onChange={(e) => {
                                    if (e.target.value === '__new__') {
                                      setEditorFilename('');
                                      setEditorCode('');
                                      setEditorCommitMessage('');
                                    } else {
                                      void handleEditorFileSelect(e.target.value);
                                    }
                                  }}
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  <option value="__new__">+ Create new file</option>
                                  {editorFiles.map((file) => (
                                    <option key={file.id} value={file.path}>{file.path} ({file.language})</option>
                                  ))}
                                </select>
                                {!editorFiles.some((f) => f.path === editorFilename) && (
                                  <div className="flex items-center gap-3">
                                    <Input id="editor-filename" value={editorFilename} onChange={(e) => setEditorFilename(e.target.value)} placeholder="e.g. main.py, index.ts, App.jsx" className="flex-1" />
                                    {editorFilename && (
                                      <span className="shrink-0 text-xs font-mono px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">{editorDetectedLanguage}</span>
                                    )}
                                  </div>
                                )}
                                {editorFiles.some((f) => f.path === editorFilename) && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-foreground">{editorFilename}</span>
                                    <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">editing</span>
                                    <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">{editorDetectedLanguage}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <Input id="editor-filename" value={editorFilename} onChange={(e) => setEditorFilename(e.target.value)} placeholder="e.g. main.py, index.ts, App.jsx" className="flex-1" />
                                {editorFilename && (
                                  <span className="shrink-0 text-xs font-mono px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">{editorDetectedLanguage}</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <label htmlFor="editor-code" className="block text-sm text-foreground mb-2">Code</label>
                            <div className="relative rounded-md border border-border overflow-hidden" style={{ background: '#282c34' }}>
                              {/* IDE-style overlay editor: syntax highlight behind transparent textarea */}
                              <div className="relative min-h-[320px] max-h-[600px] overflow-auto">
                                {/* Syntax-highlighted layer (behind) */}
                                <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
                                  <SyntaxHighlighter
                                    language={editorDetectedLanguage}
                                    style={oneDark}
                                    showLineNumbers
                                    customStyle={{
                                      margin: 0,
                                      padding: '0.75rem',
                                      background: 'transparent',
                                      fontSize: '0.82rem',
                                      lineHeight: '1.5',
                                      minHeight: '100%',
                                      overflow: 'visible',
                                      whiteSpace: 'pre',
                                      wordBreak: 'keep-all',
                                    }}
                                    lineNumberStyle={{
                                      minWidth: '2.5em',
                                      color: '#6b7280',
                                      userSelect: 'none',
                                      paddingRight: '1rem',
                                    }}
                                    codeTagProps={{
                                      style: {
                                        fontSize: '0.82rem',
                                        lineHeight: '1.5',
                                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                                      },
                                    }}
                                  >
                                    {editorCode || ' '}
                                  </SyntaxHighlighter>
                                </div>
                                {/* Transparent textarea (on top) */}
                                <textarea
                                  id="editor-code"
                                  value={editorCode}
                                  onChange={(e) => setEditorCode(e.target.value)}
                                  placeholder="Write your code here..."
                                  spellCheck={false}
                                  className="relative w-full min-h-[320px] resize-y font-mono focus:outline-none"
                                  style={{
                                    background: 'transparent',
                                    color: 'transparent',
                                    caretColor: '#e5e7eb',
                                    fontSize: '0.82rem',
                                    lineHeight: '1.5',
                                    padding: '0.75rem 0.75rem 0.75rem 4.5rem',
                                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                                    whiteSpace: 'pre',
                                    overflowWrap: 'normal',
                                    wordBreak: 'keep-all',
                                    WebkitTextFillColor: 'transparent',
                                  } as React.CSSProperties}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Tab') {
                                      e.preventDefault();
                                      const target = e.target as HTMLTextAreaElement;
                                      const start = target.selectionStart;
                                      const end = target.selectionEnd;
                                      const newValue = editorCode.substring(0, start) + '  ' + editorCode.substring(end);
                                      setEditorCode(newValue);
                                      requestAnimationFrame(() => {
                                        target.selectionStart = target.selectionEnd = start + 2;
                                      });
                                    }
                                  }}
                                  onScroll={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    const highlightLayer = target.previousElementSibling as HTMLElement;
                                    if (highlightLayer) {
                                      highlightLayer.scrollTop = target.scrollTop;
                                      highlightLayer.scrollLeft = target.scrollLeft;
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-t border-border text-xs text-muted-foreground">
                                <span>
                                  {editorCode.split('\n').length} line{editorCode.split('\n').length !== 1 ? 's' : ''}
                                  {' · '}
                                  {new TextEncoder().encode(editorCode).length} bytes
                                </span>
                                <span className="font-mono">{editorDetectedLanguage}</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="editor-commit-msg" className="block text-sm text-foreground mb-2">Commit Message</label>
                            <Input id="editor-commit-msg" value={editorCommitMessage} onChange={(e) => setEditorCommitMessage(e.target.value)} placeholder={editorFilename ? `Add ${editorFilename}` : 'Describe your changes'} />
                          </div>

                          {editorStatus && (
                            <p className={`text-sm ${editorStatus.startsWith('✓') ? 'text-green-400' : 'text-muted-foreground'}`}>
                              {editorStatus}
                            </p>
                          )}

                          <Button type="submit" disabled={isCommittingCode}>
                            <GitCommitHorizontal className="h-4 w-4 mr-2" />
                            {isCommittingCode ? 'Committing...' : 'Commit Code'}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ══════════════════════════ VIEWER ══════════════════════════ */}
                  <TabsContent value="viewer" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                          <FileCode2 className="h-5 w-5 text-primary" />
                          Show Code
                        </CardTitle>
                        <CardDescription>Browse project files and inspect code contents.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                          <div className="rounded-md border border-border p-3">
                            <label htmlFor="viewer-repo" className="block text-sm text-foreground mb-2">Repository</label>
                            <select id="viewer-repo" value={selectedRepoId} onChange={(event) => setSelectedRepoId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                              <option value="">Select repository</option>
                              {repositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>{repo.name}</option>
                              ))}
                            </select>

                            <div className="mt-4 space-y-2 max-h-[420px] overflow-auto pr-1">
                              {repositoryFiles.map((file) => (
                                <button
                                  key={file.id}
                                  type="button"
                                  onClick={() => void loadFileContent(file.path)}
                                  className={`w-full rounded-md border p-2 text-left text-xs ${
                                    selectedFilePath === file.path
                                      ? 'border-primary bg-primary/10 text-foreground'
                                      : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40'
                                  }`}
                                >
                                  {file.path}
                                </button>
                              ))}
                              {!repositoryFiles.length && (
                                <p className="text-xs text-muted-foreground">No files available in this repository.</p>
                              )}
                            </div>
                          </div>

                          <div className="rounded-md border border-border overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 bg-muted/30">
                              <p className="text-sm font-medium text-foreground truncate">{selectedFilePath || 'No file selected'}</p>
                              {selectedFileContent && (
                                <p className="text-xs text-muted-foreground">
                                  {selectedFileContent.language} | {formatBytes(selectedFileContent.size_bytes)}
                                </p>
                              )}
                            </div>

                            {isFileLoading ? (
                              <div className="p-4 text-sm text-muted-foreground">Loading file content...</div>
                            ) : selectedFileContent ? (
                              <div className="max-h-[540px] overflow-auto bg-[#0b0f14]">
                                {selectedFileContent.language.startsWith('binary:') ? (
                                  (() => {
                                    const mime = getBinaryMimeType(selectedFileContent.language);
                                    if (mime.startsWith('image/') && (selectedFileContent.content || '').startsWith('data:')) {
                                      return (
                                        <div className="p-4 bg-card">
                                          <img src={selectedFileContent.content || ''} alt={selectedFileContent.path} className="max-w-full h-auto rounded-md border border-border" />
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="p-4 text-sm text-muted-foreground bg-card">
                                        Binary file preview is not available for this file type yet.
                                      </div>
                                    );
                                  })()
                                ) : selectedFileContent.path.toLowerCase().endsWith('.md') ? (
                                  <div className="bg-card p-4 space-y-2">
                                    {isReadmeAssetLoading && (
                                      <p className="text-xs text-muted-foreground">Loading README assets...</p>
                                    )}
                                    <GitHubReadme
                                      content={selectedFileContent.content || ''}
                                      resolveAssetUrl={resolveRepositoryReadmeAssetUrl}
                                    />
                                  </div>
                                ) : (
                                  <SyntaxHighlighter
                                    language={getSyntaxLanguage(selectedFileContent.language)}
                                    style={oneDark}
                                    showLineNumbers
                                    wrapLongLines
                                    customStyle={{
                                      margin: 0,
                                      padding: '1rem',
                                      background: '#0b0f14',
                                      fontSize: '0.78rem',
                                      minHeight: '100%',
                                    }}
                                    lineNumberStyle={{
                                      minWidth: '2.5em',
                                      color: '#6b7280',
                                      userSelect: 'none',
                                      paddingRight: '1rem',
                                    }}
                                  >
                                    {selectedFileContent.content || ''}
                                  </SyntaxHighlighter>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 text-sm text-muted-foreground">Choose a file to view code.</div>
                            )}
                          </div>
                        </div>

                        {repoDataError && <p className="text-sm text-destructive">{repoDataError}</p>}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ══════════════════════════ GITHUB IMPORT ══════════════════════════ */}
                  <TabsContent value="github" className="space-y-6">
                    <GitHubImportTab
                      githubRepos={githubRepos}
                      setGithubRepos={setGithubRepos}
                      isGithubLoading={isGithubLoading}
                      setIsGithubLoading={setIsGithubLoading}
                      githubError={githubError}
                      setGithubError={setGithubError}
                      githubSearch={githubSearch}
                      setGithubSearch={setGithubSearch}
                      importingRepoId={importingRepoId}
                      setImportingRepoId={setImportingRepoId}
                      githubImportStatus={githubImportStatus}
                      setGithubImportStatus={setGithubImportStatus}
                      githubFetchedRef={githubFetchedRef}
                      refreshRepositories={refreshRepositories}
                      refreshActivity={refreshActivity}
                    />
                  </TabsContent>
                </Tabs>

                {/* Delete dialog */}
                <AlertDialog
                  open={deleteDialogOpen}
                  onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) {
                      setDeleteTargetRepository(null);
                      setDeleteRepositoryInput('');
                    }
                  }}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Repository</AlertDialogTitle>
                      <AlertDialogDescription>
                        {deleteTargetRepository
                          ? `Are you sure you want to delete "${deleteTargetRepository.name}"? This action cannot be undone.`
                          : 'Are you sure you want to delete this repository?'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    {deleteTargetRepository && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          To delete this repository, type <span className="font-semibold text-foreground">{deleteTargetRepository.name}</span> below.
                        </p>
                        <Input value={deleteRepositoryInput} onChange={(event) => setDeleteRepositoryInput(event.target.value)} placeholder={deleteTargetRepository.name} autoComplete="off" />
                      </div>
                    )}

                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingRepository}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(event) => {
                          event.preventDefault();
                          if (!canConfirmDelete || isDeletingRepository) return;
                          void handleDeleteRepository();
                        }}
                        disabled={!canConfirmDelete || isDeletingRepository}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeletingRepository ? 'Deleting...' : 'Yes, delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Repository;
