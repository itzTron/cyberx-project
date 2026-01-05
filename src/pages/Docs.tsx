import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Book, Rocket, Wrench, Shield, ChevronRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';
import { tools } from '@/data/tools';

const docSections = [
  {
    icon: Rocket,
    title: 'Getting Started',
    items: [
      { title: 'Installation', href: '#installation' },
      { title: 'Requirements', href: '#requirements' },
      { title: 'Quick Start', href: '#quickstart' },
    ],
  },
  {
    icon: Wrench,
    title: 'Tools Overview',
    items: tools.slice(0, 5).map(tool => ({
      title: tool.name,
      href: `/tools/${tool.slug}`,
    })),
  },
  {
    icon: Shield,
    title: 'Security Notes',
    items: [
      { title: 'Best Practices', href: '#best-practices' },
      { title: 'Responsible Use', href: '#responsible-use' },
    ],
  },
];

const Docs = () => {
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
              DOCUMENTATION
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">CyberX </span>
              <span className="text-primary neon-text">Docs</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Learn how to install, configure, and use CyberX effectively.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Docs Content */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {docSections.map((section) => (
                  <GlassCard key={section.title} className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <section.icon className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-foreground">{section.title}</h3>
                    </div>
                    <ul className="space-y-2">
                      {section.items.map((item) => (
                        <li key={item.title}>
                          <Link
                            to={item.href}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className="w-3 h-3" />
                            {item.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-8">
              {/* Installation */}
              <GlassCard id="installation">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                  <Book className="w-6 h-6 text-primary" />
                  Installation
                </h2>
                <div className="prose prose-invert max-w-none">
                  <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Prerequisites</h3>
                  <ul className="space-y-2 text-muted-foreground">
                    <li>• Python 3.8 or higher</li>
                    <li>• pip package manager</li>
                    <li>• Git (optional, for cloning)</li>
                  </ul>

                  <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Install via pip</h3>
                  <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">pip install cyberx</code>
                  </pre>

                  <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Install from source</h3>
                  <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">{`git clone https://github.com/yourusername/cyberx.git
cd cyberx
pip install -r requirements.txt
python setup.py install`}</code>
                  </pre>
                </div>
              </GlassCard>

              {/* Quick Start */}
              <GlassCard id="quickstart">
                <h2 className="text-2xl font-bold text-foreground mb-4">Quick Start</h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-muted-foreground mb-4">
                    After installation, you can start using CyberX right away:
                  </p>

                  <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Basic Commands</h3>
                  <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto">
                    <code className="text-sm font-mono text-primary">{`# Show help
cyberx --help

# Run network scanner
cyberx scan --target 192.168.1.0/24

# Analyze a file for malware
cyberx analyze --file suspicious.exe

# Generate security report
cyberx audit --output report.pdf`}</code>
                  </pre>
                </div>
              </GlassCard>

              {/* Best Practices */}
              <GlassCard id="best-practices">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                  <Shield className="w-6 h-6 text-primary" />
                  Security Best Practices
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    CyberX is designed for legitimate security research and testing. 
                    Always follow these guidelines:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Only scan networks and systems you own or have explicit permission to test.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Document your testing activities and obtain proper authorization.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Report vulnerabilities responsibly to affected parties.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      Keep CyberX updated to benefit from the latest security improvements.
                    </li>
                  </ul>
                </div>
              </GlassCard>

              {/* Contributing */}
              <GlassCard>
                <h2 className="text-2xl font-bold text-foreground mb-4">Contributing</h2>
                <p className="text-muted-foreground mb-4">
                  CyberX is open source and welcomes contributions! Here's how you can help:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">1.</span>
                    Fork the repository on GitHub
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">2.</span>
                    Create a feature branch for your changes
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">3.</span>
                    Submit a pull request with a clear description
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">4.</span>
                    Report bugs or suggest features via GitHub Issues
                  </li>
                </ul>
              </GlassCard>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Docs;
