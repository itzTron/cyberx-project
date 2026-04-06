import { motion } from 'framer-motion';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, ExternalLink, Lightbulb, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';
import { getToolBySlug, tools } from '@/data/tools';

const ToolDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const tool = getToolBySlug(slug || '');

  if (!tool) {
    return (
      <div className="min-h-screen bg-background">

        <div className="pt-32 pb-16 container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Tool Not Found</h1>
          <Button asChild>
            <Link to="/tools">Back to Tools</Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const Icon = tool.icon;
  const currentIndex = tools.findIndex((currentTool) => currentTool.slug === slug);
  const prevTool = currentIndex > 0 ? tools[currentIndex - 1] : null;
  const nextTool = currentIndex < tools.length - 1 ? tools[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background">


      <section className="pt-32 pb-16 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Link
              to="/tools"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tools
            </Link>

            <div className="flex items-start gap-6 mb-8">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                <Icon className="w-12 h-12 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground">
                    {tool.category}
                  </span>
                  <span
                    className={`text-xs font-mono px-2 py-1 rounded ${
                      tool.priority === 'High' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {tool.priority} Priority
                  </span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">{tool.name}</h1>
                <p className="text-xl text-muted-foreground max-w-2xl">{tool.description}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <GlassCard>
                <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  Key Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tool.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-foreground font-mono text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard>
                <h2 className="text-2xl font-bold text-foreground mb-6">Download Placeholders</h2>
                <p className="text-muted-foreground mb-6">
                  Use these placeholders for CLI, repository, and ZIP downloads while final release assets are being
                  prepared.
                </p>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/40 border border-border">
                    <p className="text-sm text-muted-foreground mb-2">CLI Install Command (Placeholder)</p>
                    <code className="text-sm font-mono text-primary">{tool.downloads.cliInstallCommand}</code>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/40 border border-border">
                    <p className="text-sm text-muted-foreground mb-2">CLI Run Command (Placeholder)</p>
                    <code className="text-sm font-mono text-primary">{tool.downloads.cliRunCommand}</code>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                  <Button asChild variant="outline">
                    <a href={tool.downloads.githubRepoUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Visit GitHub Repo
                    </a>
                  </Button>
                  <Button asChild className="neon-border">
                    <a href={tool.downloads.zipDownloadUrl} download>
                      <Download className="w-4 h-4 mr-2" />
                      Download ZIP
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/download?tool=${encodeURIComponent(tool.slug)}`}>
                      <Terminal className="w-4 h-4 mr-2" />
                      Open Tool Download Page
                    </Link>
                  </Button>
                </div>
              </GlassCard>
            </div>

            <div className="space-y-6">
              <GlassCard>
                <h3 className="text-lg font-semibold text-foreground mb-4">Details</h3>
                <div className="space-y-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Complexity</span>
                    <p className="text-foreground font-medium">{tool.complexity}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Impact</span>
                    <p className="text-foreground font-medium">{tool.impact}</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Category</span>
                    <p className="text-foreground font-medium">{tool.category}</p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  Future Enhancements
                </h3>
                <ul className="space-y-3">
                  {tool.futureEnhancements.map((enhancement) => (
                    <li key={enhancement} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">-&gt;</span>
                      {enhancement}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </div>
          </div>

          <div className="flex justify-between mt-12 pt-8 border-t border-border">
            {prevTool ? (
              <Link
                to={`/tools/${prevTool.slug}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{prevTool.name}</span>
              </Link>
            ) : (
              <div />
            )}
            {nextTool && (
              <Link
                to={`/tools/${nextTool.slug}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <span>{nextTool.name}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ToolDetail;
