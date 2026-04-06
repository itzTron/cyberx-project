import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FolderGit2 } from 'lucide-react';

import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import ToolCard from '@/components/ToolCard';
import GlassCard from '@/components/GlassCard';
import { tools } from '@/data/tools';
import { downloadRepositoryAsZip, listPublicToolRepositories, type HubRepository } from '@/lib/hubApi';
import { isSupabaseConfigured } from '@/lib/supabase';

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
};

const Tools = () => {
  const [publicTools, setPublicTools] = useState<HubRepository[]>([]);
  const [isLoadingPublicTools, setIsLoadingPublicTools] = useState(true);
  const [publicToolsError, setPublicToolsError] = useState('');
  const [downloadingRepoId, setDownloadingRepoId] = useState('');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPublicTools = async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setIsLoadingPublicTools(false);
          setPublicTools([]);
        }
        return;
      }

      try {
        setIsLoadingPublicTools(true);
        setPublicToolsError('');
        const repositories = await listPublicToolRepositories();
        if (!cancelled) {
          setPublicTools(repositories);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load public tool list.';
          setPublicToolsError(message);
          setPublicTools([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPublicTools(false);
        }
      }
    };

    void loadPublicTools();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownloadPublicRepositoryZip = async (repo: HubRepository) => {
    setDownloadingRepoId(repo.id);
    setDownloadError('');

    try {
      await downloadRepositoryAsZip({
        repoId: repo.id,
        repoSlug: repo.slug,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate zip for this repository.';
      setDownloadError(message);
    } finally {
      setDownloadingRepoId('');
    }
  };

  return (
    <div className="min-h-screen bg-background">


      <section className="pt-32 pb-16 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/30 mb-4">
              TOOLS
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">Security </span>
              <span className="text-primary neon-text">Tools</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Explore the core CyberX tools and the community-maintained public tool list.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="CORE TOOLS"
            title="CyberX Tool Collection"
            description="Official tools curated for Cyberspace-X 2.0."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool, index) => (
              <ToolCard
                key={tool.slug}
                icon={tool.icon}
                title={tool.name}
                description={tool.shortDescription}
                slug={tool.slug}
                features={tool.features}
                delay={index * 0.05}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-8 pb-16 relative z-10">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="PUBLIC TOOL LIST"
            title="Published Public Repositories"
            description="Repositories pushed by users and explicitly published to the public tool list."
          />

          {isLoadingPublicTools ? (
            <p className="text-center text-muted-foreground">Loading public tool list...</p>
          ) : publicToolsError ? (
            <p className="text-center text-destructive">{publicToolsError}</p>
          ) : publicTools.length === 0 ? (
            <p className="text-center text-muted-foreground">No repositories have been published to the public tool list yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicTools.map((repo, index) => (
                <motion.div
                  key={repo.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <GlassCard className="h-full flex flex-col">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderGit2 className="w-5 h-5 text-primary shrink-0" />
                        <h3 className="text-lg font-semibold text-foreground truncate">{repo.name}</h3>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                        Public
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground flex-1">{repo.description || 'No description provided.'}</p>
                    <p className="text-xs text-muted-foreground mt-3">Updated: {formatDate(repo.updated_at)}</p>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void handleDownloadPublicRepositoryZip(repo)}
                        disabled={downloadingRepoId === repo.id}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm text-foreground hover:border-primary/50 hover:bg-muted/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Download className="w-4 h-4" />
                        {downloadingRepoId === repo.id ? 'Preparing ZIP...' : 'Download ZIP'}
                      </button>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          )}
          {downloadError && <p className="text-center text-destructive mt-6">{downloadError}</p>}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Tools;
