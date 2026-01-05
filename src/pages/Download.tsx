import { motion } from 'framer-motion';
import { Download as DownloadIcon, Monitor, Apple, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';
import SectionHeader from '@/components/SectionHeader';

const platforms = [
  {
    name: 'Windows',
    icon: Monitor,
    version: 'v0.1.0-alpha',
    size: '~45 MB',
    available: false,
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
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero */}
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
              <span className="text-foreground">Get </span>
              <span className="text-primary neon-text">CyberX</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Download the latest version of CyberX for your operating system. 
              Currently available as CLI version, with GUI coming soon.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Platform Downloads */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
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
                      <span className="text-xs font-mono text-muted-foreground">
                        {platform.version}
                      </span>
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
                    <Button className="w-full neon-border">
                      <DownloadIcon className="w-4 h-4 mr-2" />
                      Download
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

      {/* CLI Usage */}
      <section className="py-16 relative z-10 cyber-gradient">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="CLI VERSION"
            title="Current CLI Usage"
            description="While the GUI version is in development, you can use CyberX via command line."
          />
          
          <div className="max-w-3xl mx-auto">
            <GlassCard>
              <h3 className="text-lg font-semibold text-foreground mb-4">Quick Start</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Clone the repository:</p>
                  <pre className="bg-background/50 border border-border rounded-lg p-3 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">
                      git clone https://github.com/yourusername/cyberx.git
                    </code>
                  </pre>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Install dependencies:</p>
                  <pre className="bg-background/50 border border-border rounded-lg p-3 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">
                      pip install -r requirements.txt
                    </code>
                  </pre>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Run CyberX:</p>
                  <pre className="bg-background/50 border border-border rounded-lg p-3 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">
                      python cyberx.py --help
                    </code>
                  </pre>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Version Info */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <GlassCard>
              <h3 className="text-xl font-bold text-foreground mb-6">Version Information</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">CLI Version Available</h4>
                    <p className="text-sm text-muted-foreground">
                      Full functionality via command-line interface
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-cyber-cyan mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">GUI Version In Development</h4>
                    <p className="text-sm text-muted-foreground">
                      Modern graphical interface coming this semester
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-cyber-cyan mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">Desktop App Packaging</h4>
                    <p className="text-sm text-muted-foreground">
                      Standalone executables for all platforms coming soon
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
