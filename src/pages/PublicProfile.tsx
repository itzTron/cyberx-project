import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Code2, Copy, Eye, FolderGit2, Github, Globe, Linkedin, MapPin, UserCheck, UserPlus } from 'lucide-react';
import GitHubReadme from '@/components/GitHubReadme';
import Footer from '@/components/Footer';
import ForkRepositoryButton from '@/components/ForkRepositoryButton';
import GlassCard from '@/components/GlassCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  getPublicUserProfile, getPublicUserRepositories, getFollowStatus, followUser, unfollowUser,
  type PublicUserProfile, type HubRepository, type HubFollowStatus,
} from '@/lib/hubApi';
import { getSupabaseClient } from '@/lib/supabase';

const getInitials = (name: string) =>
  name.split(' ').map((p) => p.trim()[0] || '').join('').slice(0, 2).toUpperCase();

const formatDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
};

const PublicProfile = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [repos, setRepos] = useState<HubRepository[]>([]);
  const [followStatus, setFollowStatus] = useState<HubFollowStatus>({ isFollowing: false, followerCount: 0, followingCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  // 'preview' | 'code'
  const [readmeView, setReadmeView] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const profileData = await getPublicUserProfile(username);
        if (cancelled) return;
        if (!profileData) { navigate('/404', { replace: true }); return; }
        setProfile(profileData);
        const [repoData, follow] = await Promise.all([
          getPublicUserRepositories(profileData.id),
          getFollowStatus(profileData.id),
        ]);
        if (cancelled) return;
        setRepos(repoData);
        setFollowStatus(follow);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [username, navigate]);

  const handleCopyReadme = async () => {
    if (!profile?.profileReadme) return;
    try {
      await navigator.clipboard.writeText(profile.profileReadme);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = profile.profileReadme;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── localStorage-first follow helpers ────────────────────────────────────────
  const LS_FOLLOWS_KEY = `cyberx_follows_${currentUserId ?? 'anon'}`;

  const getLocalFollows = (): Set<string> => {
    try {
      const raw = localStorage.getItem(LS_FOLLOWS_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  };

  const setLocalFollows = (set: Set<string>) => {
    try { localStorage.setItem(LS_FOLLOWS_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
  };

  // Merge localStorage state into initial followStatus on profile load
  useEffect(() => {
    if (!profile || !currentUserId) return;
    const localFollows = getLocalFollows();
    if (localFollows.has(profile.id) && !followStatus.isFollowing) {
      setFollowStatus((p) => ({ ...p, isFollowing: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, currentUserId]);

  const handleFollow = async () => {
    if (!profile) return;
    if (!currentUserId) { navigate('/signin'); return; }
    if (currentUserId === profile.id) return;
    setIsFollowLoading(true);

    const localFollows = getLocalFollows();
    const alreadyFollowing = followStatus.isFollowing || localFollows.has(profile.id);

    try {
      if (alreadyFollowing) {
        // ── Unfollow ──────────────────────────────────────────────────────────
        // 1. Update localStorage immediately
        await unfollowUser(profile.id);
        localFollows.delete(profile.id);
        setLocalFollows(localFollows);
        setFollowStatus((p) => ({ ...p, isFollowing: false, followerCount: Math.max(0, p.followerCount - 1) }));
        toast({ title: 'Unfollowed', description: `You unfollowed @${profile.username}.` });

      } else {
        // ── Follow ────────────────────────────────────────────────────────────
        // 1. Update localStorage immediately — UI always works
        await followUser(profile.id);
        localFollows.add(profile.id);
        setLocalFollows(localFollows);
        setFollowStatus((p) => ({ ...p, isFollowing: true, followerCount: p.followerCount + 1 }));
        toast({ title: '✦ Following!', description: `You are now following @${profile.username}.` });

        // 3. Fire-and-forget follow email notification
        const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';
        void fetch(`${serverUrl}/follow/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            followerUserId: currentUserId,
            targetUserId: profile.id,
          }),
        })
          .then(async (response) => {
            if (response.ok) return;
            const payload = await response.json().catch(() => null);
            console.warn('[follow] Follow notification delivery failed:', payload?.error || response.statusText);
          })
          .catch((error) => {
            console.warn('[follow] Follow notification request failed:', error);
          });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update the follow state right now.';
      console.error('[PublicProfile] Follow error:', err);
      toast({
        title: alreadyFollowing ? 'Unfollow failed' : 'Follow failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsFollowLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-32 pb-16 container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-72" /><Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!profile) return null;
  const isOwnProfile = currentUserId === profile.id;

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-28 pb-10 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
            <GlassCard>
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <Avatar className="w-24 h-24 border-2 border-primary/40 shrink-0">
                  <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />
                  <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                    {getInitials(profile.fullName || profile.username)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start gap-3 mb-2">
                    <div>
                      <h1 className="text-2xl font-bold text-foreground">{profile.fullName || profile.username}</h1>
                      <p className="text-sm text-primary font-mono">@{profile.username}</p>
                    </div>
                    {!isOwnProfile && (
                      <Button size="sm" variant={followStatus.isFollowing ? 'outline' : 'default'}
                        onClick={() => void handleFollow()} disabled={isFollowLoading}
                        className={followStatus.isFollowing ? 'border-primary/40' : 'neon-border'}>
                        {isFollowLoading ? <span className="flex items-center gap-1.5"><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />Working…</span>
                          : followStatus.isFollowing ? <span className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" />Following</span>
                          : <span className="flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" />Follow</span>}
                      </Button>
                    )}
                    {isOwnProfile && <Button size="sm" variant="outline" asChild className="border-primary/30"><Link to="/profile">Edit Profile</Link></Button>}
                  </div>
                  {profile.bio && <p className="text-muted-foreground text-sm mb-3 max-w-xl">{profile.bio}</p>}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                    {profile.locationLabel && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary/60" />{profile.locationLabel}</span>}
                    {profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors"><Github className="w-3.5 h-3.5" />GitHub</a>}
                    {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors"><Globe className="w-3.5 h-3.5" />Website</a>}
                    {profile.linkedinUrl && <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors"><Linkedin className="w-3.5 h-3.5" />LinkedIn</a>}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span><strong className="text-foreground font-mono">{followStatus.followerCount}</strong> <span className="text-muted-foreground">followers</span></span>
                    <span><strong className="text-foreground font-mono">{followStatus.followingCount}</strong> <span className="text-muted-foreground">following</span></span>
                    <span><strong className="text-foreground font-mono">{repos.length}</strong> <span className="text-muted-foreground">repos</span></span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      <section className="py-8 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="repositories">Repositories ({repos.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                {profile.profileReadme ? (
                  <GlassCard className="overflow-hidden !p-0">
                    {/* Header bar — GitHub style */}
                    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                      <span className="text-xs font-mono text-muted-foreground">
                        {profile.username}/README.md
                      </span>
                      <div className="flex items-center gap-1">
                        {/* Preview / Code toggle */}
                        <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => setReadmeView('preview')}
                            className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${
                              readmeView === 'preview'
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => setReadmeView('code')}
                            className={`flex items-center gap-1 px-3 py-1.5 border-l border-border transition-colors ${
                              readmeView === 'code'
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            }`}
                          >
                            <Code2 className="w-3 h-3" />
                            Code
                          </button>
                        </div>
                        {/* Copy button */}
                        <button
                          type="button"
                          onClick={() => void handleCopyReadme()}
                          title="Copy raw markdown"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                        >
                          {copied
                            ? <><Check className="w-3 h-3 text-green-400" />Copied!</>
                            : <><Copy className="w-3 h-3" />Copy raw</>}
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      {readmeView === 'preview' ? (
                        <div className="p-4">
                          <GitHubReadme content={profile.profileReadme} />
                        </div>
                      ) : (
                        <pre className="overflow-x-auto rounded-lg bg-muted/40 border border-border p-4 text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                          <code>{profile.profileReadme}</code>
                        </pre>
                      )}
                    </div>
                  </GlassCard>
                ) : (
                  <GlassCard className="text-center py-12"><p className="text-muted-foreground text-sm">This user hasn't written a profile README yet.</p></GlassCard>
                )}
              </TabsContent>
              <TabsContent value="repositories">
                {repos.length === 0 ? (
                  <GlassCard className="text-center py-12"><FolderGit2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" /><p className="text-muted-foreground text-sm">No public repositories yet.</p></GlassCard>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {repos.map((repo, i) => (
                      <motion.div key={repo.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <GlassCard className="h-full flex flex-col">
                          <div className="flex items-start gap-2 mb-2">
                            <FolderGit2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-foreground truncate">{repo.name}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{repo.description || 'No description.'}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">{repo.visibility}</span>
                          </div>
                          {!isOwnProfile && (
                            <div className="pb-2">
                              <ForkRepositoryButton
                                repoId={repo.id}
                                repoName={repo.name}
                                ownerId={profile.id}
                                ownerUsername={profile.username}
                              />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-auto pt-2">Updated {formatDate(repo.updated_at)}</p>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default PublicProfile;
