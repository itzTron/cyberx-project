import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Apple,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Download as DownloadIcon,
  ExternalLink,
  Monitor,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import GlassCard from '@/components/GlassCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import SectionHeader from '@/components/SectionHeader';
import { getToolBySlug, tools } from '@/data/tools';
import { cn } from '@/lib/utils';

const platforms = [
  {
    name: 'Windows',
    icon: Monitor,
    version: 'v0.1.0-alpha',
    size: '~45 MB',
    available: true,
    requirements: 'Windows 10/11 (64-bit)',
  },
  {
    name: 'macOS',
    icon: Apple,
    version: 'v0.1.0-alpha',
    size: '~40 MB',
    available: false,
    requirements: 'macOS 11.0+',
  },
  {
    name: 'Linux',
    icon: Terminal,
    version: 'v0.1.0-alpha',
    size: '~35 MB',
    available: true,
    requirements: 'Ubuntu 20.04+, Debian 11+, or compatible',
  },
];

const Download = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toolPickerOpen, setToolPickerOpen] = useState(false);

  const selectedSlug = searchParams.get('tool') || tools[0]?.slug || '';
  const selectedTool = useMemo(() => getToolBySlug(selectedSlug) || tools[0], [selectedSlug]);

  const handleToolSelect = (slug: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('tool', slug);
    setSearchParams(nextSearchParams);
    setToolPickerOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-16 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/30 mb-4">
              DOWNLOAD
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">Cyberspace-X 2.0 </span>
              <span className="text-primary neon-text">Tool Downloads</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Search and choose a tool, then open its CLI placeholder, GitHub repository, and ZIP package placeholder.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4 max-w-4xl">
          <GlassCard>
            <h2 className="text-2xl font-bold text-foreground mb-4">Tool Selector</h2>
            <p className="text-muted-foreground mb-6">
              Available tools: CyberX, Network Security Scanner, Intrusion Detection System, and Steganography Tool.
            </p>

            <Popover open={toolPickerOpen} onOpenChange={setToolPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={toolPickerOpen}
                  className="w-full justify-between"
                >
                  {selectedTool ? selectedTool.name : 'Select a tool'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] max-w-[calc(100vw-2rem)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search tool name..." />
                  <CommandList>
                    <CommandEmpty>No matching tool found.</CommandEmpty>
                    <CommandGroup heading="Tools">
                      {tools.map((tool) => (
                        <CommandItem
                          key={tool.slug}
                          value={`${tool.name} ${tool.slug}`}
                          onSelect={() => handleToolSelect(tool.slug)}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedTool?.slug === tool.slug ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          {tool.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedTool && (
              <div className="mt-8 space-y-6">
                <div className="p-4 rounded-lg border border-border bg-muted/30">
                  <h3 className="text-xl font-semibold text-foreground">{selectedTool.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{selectedTool.description}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-2">CLI Install Command (Placeholder)</p>
                    <code className="text-sm font-mono text-primary">{selectedTool.downloads.cliInstallCommand}</code>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-2">CLI Run Command (Placeholder)</p>
                    <code className="text-sm font-mono text-primary">{selectedTool.downloads.cliRunCommand}</code>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild variant="outline">
                    <a href={selectedTool.downloads.githubRepoUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Visit Original GitHub Repo
                    </a>
                  </Button>
                  <Button asChild className="neon-border">
                    <a href={selectedTool.downloads.zipDownloadUrl} download>
                      <DownloadIcon className="w-4 h-4 mr-2" />
                      Download Tool ZIP
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/tools/${selectedTool.slug}`}>
                      View Tool Details
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </section>

      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="CYBERX DESKTOP"
            title="CyberX Desktop Package"
            description="Core desktop package placeholders by platform while full installers are being finalized."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {platforms.map((platform, index) => (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <GlassCard className="h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <platform.icon className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{platform.name}</h3>
                      <span className="text-xs font-mono text-muted-foreground">{platform.version}</span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6 flex-1">
                    <p className="text-sm text-muted-foreground">
                      <span className="text-foreground">Size:</span> {platform.size}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-foreground">Requirements:</span> {platform.requirements}
                    </p>
                  </div>

                  {platform.available ? (
                    <Button asChild className="w-full neon-border">
                      <a
                        href={`/downloads/cyberx-${platform.name.toLowerCase()}.${platform.name === 'Windows' ? 'exe' : platform.name === 'macOS' ? 'dmg' : 'zip'}`}
                        download={`cyberx-${platform.name.toLowerCase()}.${platform.name === 'Windows' ? 'exe' : platform.name === 'macOS' ? 'dmg' : 'zip'}`}
                      >
                        <DownloadIcon className="w-4 h-4 mr-2" />
                        Download Placeholder
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      Coming Soon
                    </Button>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 relative z-10 cyber-gradient">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <GlassCard>
              <h3 className="text-xl font-bold text-foreground mb-6">Release Notes</h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">Tool-specific pages are live</h4>
                    <p className="text-sm text-muted-foreground">
                      Each tool now has a dedicated description, details, and download placeholder actions.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-cyber-cyan mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">Installer assets are placeholders</h4>
                    <p className="text-sm text-muted-foreground">
                      ZIP and platform installers currently point to placeholder paths and can be swapped with real
                      release artifacts later.
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Download;
