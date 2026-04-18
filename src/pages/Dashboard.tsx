import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ArchiveRestore,
  Clock3,
  Diff,
  Ellipsis,
  Eye,
  EyeOff,
  ExternalLink,
  FileCode2,
  FolderGit2,
  Github,
  GitCommitHorizontal,
  Globe,
  Linkedin,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  PlusCircle,
  RefreshCw,
  Rocket,
  Trash2,
  Upload,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import GitHubReadme from '@/components/GitHubReadme';
import BranchSelector, { type BranchInfo } from '@/components/BranchSelector';
import CommitDiffViewer, { type DiffEntry } from '@/components/CommitDiffViewer';
import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  updateProfileReadme,
  updateRepositoryToolListVisibility,
  uploadRepositoryFiles,
  type DashboardBootstrap,
  type HubActivityLog,
  type HubRepository,
  type HubRepositoryCommit,
  type HubRepositoryFile,
  type RepositoryVisibility,
} from '@/lib/hubApi';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getSyntaxLanguage = (language: string) => {
  if ((language || '').startsWith('binary:')) {
    return 'text';
  }

  switch (language) {
    case 'typescript':
      return 'tsx';
    case 'javascript':
      return 'jsx';
    case 'shell':
      return 'bash';
    case 'plaintext':
      return 'text';
    default:
      return language || 'text';
  }
};

const getBinaryMimeType = (language: string) => {
  if (!language.startsWith('binary:')) {
    return '';
  }

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
    if (!token || token === '.') {
      continue;
    }

    if (token === '..') {
      stack.pop();
      continue;
    }

    stack.push(token);
  }

  return stack.join('/');
};

const getDirectoryPath = (filePath: string) => {
  const normalized = normalizeRepoPath(filePath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex === -1) {
    return '';
  }

  return normalized.slice(0, lastSlashIndex);
};

const resolveRepoRelativePath = (currentFilePath: string, source: string) => {
  const cleanSource = stripQueryAndHash(source.trim());
  if (!cleanSource) {
    return '';
  }

  if (cleanSource.startsWith('/')) {
    return normalizeRepoPath(cleanSource.slice(1));
  }

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
    if (cleanedTarget) {
      sources.add(cleanedTarget);
    }
  }

  for (const match of markdown.matchAll(htmlImageRegex)) {
    const target = (match[1] || '').trim();
    if (target) {
      sources.add(target);
    }
  }

  return Array.from(sources);
};

const getRepoFileCacheKey = (repoId: string, filePath: string) => `${repoId}::${normalizeRepoPath(filePath)}`;

const dashboardTabs = new Set(['overview', 'create', 'upload', 'viewer', 'profile']);

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { username: routeUsername } = useParams<{ username?: string }>();
  const lastRepoLoadRef = useRef(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [user, setUser] = useState<DashboardBootstrap['user'] | null>(null);
  const [repositories, setRepositories] = useState<HubRepository[]>([]);
  const [pushableRepositories, setPushableRepositories] = useState<HubRepository[]>([]);
  const [activityLogs, setActivityLogs] = useState<HubActivityLog[]>([]);
  const [profileReadmeDraft, setProfileReadmeDraft] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileStatusMessage, setProfileStatusMessage] = useState('');
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
  const [profileReadmeAssetUrls, setProfileReadmeAssetUrls] = useState<Record<string, string>>({});
  const [isProfileReadmeAssetLoading, setIsProfileReadmeAssetLoading] = useState(false);
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

  const filteredRepositories = useMemo(
    () =>
      repositories.filter((repo) => {
        const query = repoSearch.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return repo.name.toLowerCase().includes(query) || repo.description.toLowerCase().includes(query);
      }),
    [repositories, repoSearch],
  );

  const selectedRepository = repositories.find((repository) => repository.id === selectedRepoId) || null;

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (!tabParam || !dashboardTabs.has(tabParam) || tabParam === activeTab) {
      return;
    }

    setActiveTab(tabParam);
  }, [activeTab, location.search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);

    if (location.pathname !== '/repository') {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.get('tab') === value) {
      return;
    }

    params.set('tab', value);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

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

      if (lastRepoLoadRef.current !== requestId) {
        return;
      }

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

      if (lastRepoLoadRef.current !== requestId) {
        return;
      }

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
    if (!selectedRepoId) {
      return;
    }

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
        setProfileReadmeDraft(data.profileReadme);

        if (data.repositories.length > 0) {
          setSelectedRepoId(data.repositories[0].id);
        }

        if (pushableRepos.length > 0) {
          setUploadRepoId(pushableRepos[0].id);
        }

        const normalizedRouteUsername = (routeUsername || '').toLowerCase();
        const normalizedCurrentUsername = data.user.username.toLowerCase();
        if (normalizedRouteUsername !== normalizedCurrentUsername) {
          navigate(`/${data.user.username}`, { replace: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open dashboard.';
        setBootstrapError(message);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [navigate, routeUsername]);

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
          if (!repoPath) {
            continue;
          }

          const matchedFile = repositoryFiles.find((file) => normalizeRepoPath(file.path) === repoPath);
          if (!matchedFile) {
            continue;
          }

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
        if (!isCancelled) {
          console.error('Unable to resolve README image assets:', error);
        }
      } finally {
        if (!isCancelled) {
          setReadmeAssetUrls(resolvedSources);
          setIsReadmeAssetLoading(false);
        }
      }
    };

    void loadReadmeAssets();

    return () => {
      isCancelled = true;
    };
  }, [repositoryFiles, selectedFileContent, selectedRepoId]);

  useEffect(() => {
    const username = (user?.username || '').trim();
    if (!username) {
      setProfileReadmeAssetUrls({});
      setIsProfileReadmeAssetLoading(false);
      return;
    }

    const profileRepoName = `${username}.md`.toLowerCase();
    const legacyProfileRepoName = username.toLowerCase();
    const profileRepo = repositories.find((repository) => {
      const repoName = repository.name.toLowerCase();
      const repoSlug = repository.slug.toLowerCase();
      return repoName === profileRepoName || repoSlug === profileRepoName || repoName === legacyProfileRepoName || repoSlug === legacyProfileRepoName;
    });

    if (!profileRepo) {
      setProfileReadmeAssetUrls({});
      setIsProfileReadmeAssetLoading(false);
      return;
    }

    const sources = collectReadmeAssetSources(profileReadmeDraft || '');
    if (!sources.length) {
      setProfileReadmeAssetUrls({});
      setIsProfileReadmeAssetLoading(false);
      return;
    }

    let isCancelled = false;

    const loadProfileReadmeAssets = async () => {
      setIsProfileReadmeAssetLoading(true);
      const resolvedSources: Record<string, string> = {};

      try {
        const profileFilePath = `${username}.md`;
        const filesInProfileRepo =
          repoFileListCacheRef.current[profileRepo.id] ||
          (await listRepositoryFiles(profileRepo.id));
        repoFileListCacheRef.current[profileRepo.id] = filesInProfileRepo;

        for (const source of sources) {
          if (isAbsoluteAssetSource(source)) {
            resolvedSources[source] = source;
            continue;
          }

          const repoPath = resolveRepoRelativePath(profileFilePath, source);
          if (!repoPath) {
            continue;
          }

          const matchedFile = filesInProfileRepo.find((file) => normalizeRepoPath(file.path) === repoPath);
          if (!matchedFile) {
            continue;
          }

          const cacheKey = getRepoFileCacheKey(profileRepo.id, matchedFile.path);
          let fileContent = repoFileContentCacheRef.current[cacheKey];
          if (!fileContent) {
            fileContent = await getRepositoryFileContent(profileRepo.id, matchedFile.path);
            repoFileContentCacheRef.current[cacheKey] = fileContent;
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
        if (!isCancelled) {
          console.error('Unable to resolve profile README assets:', error);
        }
      } finally {
        if (!isCancelled) {
          setProfileReadmeAssetUrls(resolvedSources);
          setIsProfileReadmeAssetLoading(false);
        }
      }
    };

    void loadProfileReadmeAssets();

    return () => {
      isCancelled = true;
    };
  }, [profileReadmeDraft, repositories, user?.username]);

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
    if (repo.visibility === visibility) {
      return;
    }

    setIsUpdatingRepository(true);
    setRepositoryActionStatus('');

    try {
      await updateRepositoryVisibility({
        repoId: repo.id,
        visibility,
      });
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
      await setRepositoryArchiveState({
        repoId: repo.id,
        archive,
      });
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
      await updateRepositoryToolListVisibility({
        repoId: repo.id,
        showInToolList,
      });
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
    if (!deleteTargetRepository) {
      return;
    }

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

  const handleSaveProfileReadme = async () => {
    setIsSavingProfile(true);
    setProfileStatusMessage('');

    try {
      await updateProfileReadme(profileReadmeDraft);
      setProfileStatusMessage('Profile README saved.');
      await refreshActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save profile README.';
      setProfileStatusMessage(message);
    } finally {
      setIsSavingProfile(false);
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

  const canConfirmDelete =
    Boolean(deleteTargetRepository) && deleteRepositoryInput.trim() === deleteTargetRepository?.name;
  const resolveRepositoryReadmeAssetUrl = (source: string) => readmeAssetUrls[source] || source;
  const resolveProfileReadmeAssetUrl = (source: string) => profileReadmeAssetUrls[source] || source;

  return (
    <div className="min-h-screen bg-background">


      <section className="pt-28 pb-12">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">Cyberspace-X 2.0 Hub</h1>
                <p className="text-muted-foreground mt-2">
                  GitHub-style workspace for repositories, code uploads, commits, and Markdown profile docs.
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
                <CardContent className="pt-6 text-sm text-muted-foreground">Loading dashboard...</CardContent>
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
                <Card className="border-primary/30">
                  <CardContent className="pt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                      <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary/40 bg-background p-1 self-center lg:self-start">
                        <Avatar className="h-full w-full">
                          <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName || user.username} />
                          <AvatarFallback>{getInitials(user.fullName || user.username)}</AvatarFallback>
                        </Avatar>
                      </div>

                      <div className="space-y-3 text-center lg:text-left">
                        <div>
                          <p className="text-2xl font-semibold text-foreground">{user.fullName}</p>
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        </div>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                          {user.bio.trim() || 'Add a bio from Edit Profile to introduce yourself here.'}
                        </p>
                        <div className="flex flex-wrap gap-4 justify-center lg:justify-start text-sm text-muted-foreground">
                          {user.phoneNumber && (
                            <a href={`tel:${user.phoneNumber}`} className="inline-flex items-center gap-2 hover:text-foreground transition-colors">
                              <Phone className="h-4 w-4 text-primary" />
                              {user.phoneNumber}
                            </a>
                          )}
                          {user.address && (
                            <span className="inline-flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              {user.address}
                            </span>
                          )}
                          {typeof user.locationLat === 'number' && typeof user.locationLng === 'number' && (
                            <a
                              href={`https://www.google.com/maps?q=${user.locationLat},${user.locationLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
                            >
                              <MapPin className="h-4 w-4 text-primary" />
                              {user.locationLat.toFixed(6)}, {user.locationLng.toFixed(6)}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                          {user.linkedinUrl && (
                            <a
                              href={user.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <Linkedin className="h-4 w-4" />
                              LinkedIn
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {user.githubUrl && (
                            <a
                              href={user.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <Github className="h-4 w-4" />
                              GitHub
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {user.websiteUrl && (
                            <a
                              href={user.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              <Globe className="h-4 w-4" />
                              Website
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                          <Button asChild variant="outline">
                            <Link to="/profile">Edit Profile</Link>
                          </Button>
                          <p className="text-xs text-primary self-center">{`http://localhost:8080/${user.username}`}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border border-border px-3 py-2">
                        <p className="text-muted-foreground">Repositories</p>
                        <p className="text-foreground font-semibold">{repositories.length}</p>
                      </div>
                      <div className="rounded-md border border-border px-3 py-2">
                        <p className="text-muted-foreground">Activity Events</p>
                        <p className="text-foreground font-semibold">{activityLogs.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="create">New Repository</TabsTrigger>
                    <TabsTrigger value="upload">Upload Code</TabsTrigger>
                    <TabsTrigger value="viewer">Show Code</TabsTrigger>
                    <TabsTrigger value="profile">Profile.md</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-6">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-xl">Profile README</CardTitle>
                            <CardDescription>Displayed on your profile page like GitHub.</CardDescription>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Edit README file"
                            onClick={() => setActiveTab('profile')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="rounded-md border border-border overflow-hidden">
                          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
                            <p className="text-sm font-medium text-foreground">README.md</p>
                            <button
                              type="button"
                              onClick={() => setActiveTab('profile')}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit file
                            </button>
                          </div>
                          <div className="p-4">
                            {isProfileReadmeAssetLoading && (
                              <p className="text-xs text-muted-foreground mb-2">Loading README assets...</p>
                            )}
                            <GitHubReadme
                              content={profileReadmeDraft.trim() || '*No README content yet. Click edit file to add one.*'}
                              resolveAssetUrl={resolveProfileReadmeAssetUrl}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-xl">Repositories</CardTitle>
                          <CardDescription>Search, inspect, and manage your uploaded projects.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <Input
                            value={repoSearch}
                            onChange={(event) => setRepoSearch(event.target.value)}
                            placeholder="Search repositories..."
                            className="bg-muted/40"
                          />

                          {filteredRepositories.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No repositories found.</p>
                          ) : (
                            <div className="space-y-3">
                              {filteredRepositories.map((repo) => (
                                (() => {
                                  const normalizedUsername = (user?.username || '').toLowerCase();
                                  const protectedRepositoryName = normalizedUsername ? `${normalizedUsername}.md` : '';
                                  const isProtectedProfileRepo =
                                    Boolean(protectedRepositoryName) &&
                                    (repo.name.toLowerCase() === protectedRepositoryName ||
                                      repo.slug.toLowerCase() === protectedRepositoryName);

                                  return (
                                    <div
                                      key={repo.id}
                                      className={`w-full rounded-md border p-3 transition-colors ${
                                        repo.id === selectedRepoId
                                          ? 'border-primary bg-primary/10'
                                          : 'border-border hover:border-primary/50 hover:bg-muted/40'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                    <button type="button" onClick={() => setSelectedRepoId(repo.id)} className="text-left flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-semibold text-foreground truncate">{repo.name}</p>
                                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{repo.visibility}</span>
                                        {isProtectedProfileRepo && (
                                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                                            Profile Repo
                                          </span>
                                        )}
                                        {repo.archived_at && (
                                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                            Archived
                                          </span>
                                        )}
                                        {repo.show_in_tool_list && (
                                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                                            Tool List
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-muted-foreground mt-1">{repo.description || 'No description'}</p>
                                      <p className="text-xs text-muted-foreground mt-2">Updated: {formatDateTime(repo.updated_at)}</p>
                                    </button>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={isUpdatingRepository}>
                                          <Ellipsis className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-52">
                                        <DropdownMenuItem onSelect={() => void handleRepositoryVisibilityChange(repo, 'public')}>
                                          <Eye className="mr-2 h-4 w-4" />
                                          Make Public
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => void handleRepositoryVisibilityChange(repo, 'private')}>
                                          <EyeOff className="mr-2 h-4 w-4" />
                                          Make Private
                                        </DropdownMenuItem>
                                        {repo.show_in_tool_list ? (
                                          <DropdownMenuItem onSelect={() => void handleRepositoryToolListState(repo, false)}>
                                            <Rocket className="mr-2 h-4 w-4" />
                                            Remove from Tool List
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            disabled={repo.visibility !== 'public'}
                                            onSelect={() => void handleRepositoryToolListState(repo, true)}
                                          >
                                            <Rocket className="mr-2 h-4 w-4" />
                                            Push to Public Tool List
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        {repo.archived_at ? (
                                          <DropdownMenuItem
                                            disabled={isProtectedProfileRepo}
                                            onSelect={(event) => {
                                              if (isProtectedProfileRepo) {
                                                event.preventDefault();
                                                return;
                                              }
                                              void handleRepositoryArchiveState(repo, false);
                                            }}
                                          >
                                            <ArchiveRestore className="mr-2 h-4 w-4" />
                                            Unarchive Repository
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            disabled={isProtectedProfileRepo}
                                            onSelect={(event) => {
                                              if (isProtectedProfileRepo) {
                                                event.preventDefault();
                                                return;
                                              }
                                              void handleRepositoryArchiveState(repo, true);
                                            }}
                                          >
                                            <Archive className="mr-2 h-4 w-4" />
                                            Archive Repository
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          disabled={isProtectedProfileRepo}
                                          onSelect={(event) => {
                                            if (isProtectedProfileRepo) {
                                              event.preventDefault();
                                              return;
                                            }
                                            openDeleteDialog(repo);
                                          }}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete Repository
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                  );
                                })()
                              ))}
                            </div>
                          )}

                          {repositoryActionStatus && <p className="text-sm text-muted-foreground">{repositoryActionStatus}</p>}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
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
                                onBranchChange={(branch) => {
                                  setActiveBranch(branch);
                                }}
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
                    </div>
                  </TabsContent>

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
                            <label htmlFor="repo-name" className="block text-sm text-foreground mb-2">
                              Repository Name
                            </label>
                            <Input
                              id="repo-name"
                              value={createRepoName}
                              onChange={(event) => setCreateRepoName(event.target.value)}
                              placeholder="my-awesome-project"
                              required
                            />
                          </div>

                          <div>
                            <label htmlFor="repo-description" className="block text-sm text-foreground mb-2">
                              Description
                            </label>
                            <Textarea
                              id="repo-description"
                              value={createRepoDescription}
                              onChange={(event) => setCreateRepoDescription(event.target.value)}
                              placeholder="Briefly describe your project."
                              className="min-h-[100px]"
                            />
                          </div>

                          <div>
                            <label htmlFor="repo-visibility" className="block text-sm text-foreground mb-2">
                              Visibility
                            </label>
                            <select
                              id="repo-visibility"
                              value={createRepoVisibility}
                              onChange={(event) => setCreateRepoVisibility(event.target.value as RepositoryVisibility)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="private">Private</option>
                              <option value="public">Public</option>
                            </select>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={initializeReadme}
                              onChange={(event) => setInitializeReadme(event.target.checked)}
                            />
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
                            <label htmlFor="upload-repo" className="block text-sm text-foreground mb-2">
                              Repository
                            </label>
                            <select
                              id="upload-repo"
                              value={uploadRepoId}
                              onChange={(event) => setUploadRepoId(event.target.value)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="">Select repository</option>
                              {pushableRepositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>
                                  {repo.name} ({repo.visibility})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="upload-files" className="block text-sm text-foreground mb-2">
                              Code Files
                            </label>
                            <Input
                              id="upload-files"
                              type="file"
                              multiple
                              onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                            />
                            {uploadFiles.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">{uploadFiles.length} file(s) selected.</p>
                            )}
                          </div>

                          <div>
                            <label htmlFor="commit-message" className="block text-sm text-foreground mb-2">
                              Commit Message
                            </label>
                            <Input
                              id="commit-message"
                              value={uploadCommitMessage}
                              onChange={(event) => setUploadCommitMessage(event.target.value)}
                            />
                          </div>

                          {uploadStatus && <p className="text-sm text-muted-foreground">{uploadStatus}</p>}

                          <Button type="submit" disabled={isUploading}>
                            {isUploading ? 'Uploading...' : 'Upload & Commit'}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </TabsContent>

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
                            <label htmlFor="viewer-repo" className="block text-sm text-foreground mb-2">
                              Repository
                            </label>
                            <select
                              id="viewer-repo"
                              value={selectedRepoId}
                              onChange={(event) => setSelectedRepoId(event.target.value)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="">Select repository</option>
                              {repositories.map((repo) => (
                                <option key={repo.id} value={repo.id}>
                                  {repo.name}
                                </option>
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
                                          <img
                                            src={selectedFileContent.content || ''}
                                            alt={selectedFileContent.path}
                                            className="max-w-full h-auto rounded-md border border-border"
                                          />
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

                  <TabsContent value="profile">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl">Profile Markdown (README.md)</CardTitle>
                        <CardDescription>
                          Write your profile in Markdown and preview it, similar to GitHub profile README.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div>
                            <p className="text-sm text-foreground mb-2">Editor</p>
                            <Textarea
                              value={profileReadmeDraft}
                              onChange={(event) => setProfileReadmeDraft(event.target.value)}
                              className="min-h-[420px] bg-muted/20 font-mono text-sm"
                            />
                          </div>

                          <div>
                            <p className="text-sm text-foreground mb-2">Preview</p>
                            <div className="min-h-[420px] rounded-md border border-border bg-card p-4 overflow-auto">
                              {isProfileReadmeAssetLoading && (
                                <p className="text-xs text-muted-foreground mb-2">Loading README assets...</p>
                              )}
                              <GitHubReadme content={profileReadmeDraft} resolveAssetUrl={resolveProfileReadmeAssetUrl} />
                            </div>
                          </div>
                        </div>

                        {profileStatusMessage && <p className="text-sm text-muted-foreground">{profileStatusMessage}</p>}

                        <Button onClick={() => void handleSaveProfileReadme()} disabled={isSavingProfile}>
                          {isSavingProfile ? 'Saving...' : 'Save Profile README'}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                <Card>
                  <CardContent className="pt-6 text-xs text-muted-foreground space-y-1">
                    <p className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4" />
                      Included fundamentals: repository creation, visibility controls, code upload, code viewer, commit log,
                      and profile Markdown.
                    </p>
                    <p>RLS is enabled so repository owners control settings, while authenticated users can contribute to public repositories.</p>
                  </CardContent>
                </Card>

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
                        <Input
                          value={deleteRepositoryInput}
                          onChange={(event) => setDeleteRepositoryInput(event.target.value)}
                          placeholder={deleteTargetRepository.name}
                          autoComplete="off"
                        />
                      </div>
                    )}

                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingRepository}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(event) => {
                          event.preventDefault();
                          if (!canConfirmDelete || isDeletingRepository) {
                            return;
                          }
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

export default Dashboard;
