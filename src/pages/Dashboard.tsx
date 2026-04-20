import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Clock3,
  ExternalLink,
  FolderGit2,
  Github,
  Globe,
  Linkedin,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
} from 'lucide-react';

import GitHubReadme from '@/components/GitHubReadme';
import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  getDashboardBootstrap,
  listActivityLogs,
  listPushableRepositories,
  listRepositories,
  listRepositoryFiles,
  getRepositoryFileContent,
  signOutDashboardUser,
  updateProfileReadme,
  type DashboardBootstrap,
  type HubActivityLog,
  type HubRepository,
  type HubRepositoryFile,
} from '@/lib/hubApi';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

const dashboardTabs = new Set(['overview', 'profile']);

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { username: routeUsername } = useParams<{ username?: string }>();

  const [activeTab, setActiveTab] = useState('overview');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [user, setUser] = useState<DashboardBootstrap['user'] | null>(null);
  const [repositories, setRepositories] = useState<HubRepository[]>([]);
  const [activityLogs, setActivityLogs] = useState<HubActivityLog[]>([]);
  const [profileReadmeDraft, setProfileReadmeDraft] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileStatusMessage, setProfileStatusMessage] = useState('');
  const [profileReadmeAssetUrls, setProfileReadmeAssetUrls] = useState<Record<string, string>>({});
  const [isProfileReadmeAssetLoading, setIsProfileReadmeAssetLoading] = useState(false);
  const repoFileListCacheRef = useRef<Record<string, HubRepositoryFile[]>>({});
  const repoFileContentCacheRef = useRef<Record<string, HubRepositoryFile>>({});

  /* ---- Tab sync with URL ---- */
  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (!tabParam || !dashboardTabs.has(tabParam) || tabParam === activeTab) return;
    setActiveTab(tabParam);
  }, [activeTab, location.search]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
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

  /* ---- Bootstrap ---- */
  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      setBootstrapError('');

      try {
        const data = await getDashboardBootstrap();
        setUser(data.user);
        setRepositories(data.repositories);
        setActivityLogs(data.activityLogs);
        setProfileReadmeDraft(data.profileReadme);

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

  /* ---- Profile README asset resolution ---- */
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
          if (!repoPath) continue;

          const matchedFile = filesInProfileRepo.find((file) => normalizeRepoPath(file.path) === repoPath);
          if (!matchedFile) continue;

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
        if (!isCancelled) console.error('Unable to resolve profile README assets:', error);
      } finally {
        if (!isCancelled) {
          setProfileReadmeAssetUrls(resolvedSources);
          setIsProfileReadmeAssetLoading(false);
        }
      }
    };

    void loadProfileReadmeAssets();
    return () => { isCancelled = true; };
  }, [profileReadmeDraft, repositories, user?.username]);

  /* ---- Handlers ---- */
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

  const resolveProfileReadmeAssetUrl = (source: string) => profileReadmeAssetUrls[source] || source;

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
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">Cyberspace-X 2.0 Hub</h1>
                <p className="text-muted-foreground mt-2">
                  Your personal workspace — profile, README, and activity overview.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild variant="outline">
                  <Link to="/repository">
                    <FolderGit2 className="h-4 w-4" />
                    Repositories
                  </Link>
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
                {/* User Profile Card */}
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
                            <a href={user.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <Linkedin className="h-4 w-4" /> LinkedIn <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {user.githubUrl && (
                            <a href={user.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <Github className="h-4 w-4" /> GitHub <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {user.websiteUrl && (
                            <a href={user.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <Globe className="h-4 w-4" /> Website <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                          <Button asChild variant="outline">
                            <Link to="/profile">Edit Profile</Link>
                          </Button>
                          <p className="text-xs text-primary self-center">{`${window.location.origin}/${user.username}`}</p>
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

                {/* Tabs: Overview + Profile.md */}
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="profile">Profile.md</TabsTrigger>
                  </TabsList>

                  {/* ══════════════════════════ OVERVIEW ══════════════════════════ */}
                  <TabsContent value="overview" className="space-y-6">
                    {/* Profile README display */}
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
                  </TabsContent>


                  {/* ══════════════════════════ PROFILE.MD ══════════════════════════ */}
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
