import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Book, Rocket, Wrench, Shield, ChevronRight, Terminal, Database, Server, Key } from 'lucide-react';

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
    ],
  },
  {
    icon: Server,
    title: 'Configuration',
    items: [
      { title: 'Environment Variables', href: '#env-vars' },
      { title: 'Database Setup', href: '#database' },
      { title: 'API Keys', href: '#api-keys' },
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
];

const Docs = () => {
  return (
    <div className="min-h-screen bg-background">
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
              <span className="text-foreground">Cyberspace-X 2.0 </span>
              <span className="text-primary neon-text">Docs</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Step-by-step guide to installing, configuring, and running the Cyberspace-X platform.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Docs Content */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1 hidden lg:block">
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
                          <a
                            href={item.href.startsWith('#') ? item.href : undefined}
                            {...(item.href.startsWith('/') ? { href: item.href } : {})}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className="w-3 h-3" />
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-12">
              
              {/* Requirements */}
              <GlassCard id="requirements">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                  <Terminal className="w-6 h-6 text-primary" />
                  Prerequisites
                </h2>
                <div className="prose prose-invert max-w-none">
                  <p className="text-muted-foreground mb-4">
                    Before installing Cyberspace-X 2.0, ensure your system has the following installed:
                  </p>
                  <ul className="space-y-2 text-muted-foreground list-disc pl-5">
                    <li><strong className="text-foreground">Node.js</strong> (v18 or later) &amp; npm</li>
                    <li><strong className="text-foreground">Git</strong> version control</li>
                    <li><strong className="text-foreground">Supabase CLI</strong> (optional, for local development)</li>
                    <li><strong className="text-foreground">Docker Desktop</strong> (optional, only needed if running Supabase locally)</li>
                  </ul>
                </div>
              </GlassCard>

              {/* Installation */}
              <GlassCard id="installation">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                  <Book className="w-6 h-6 text-primary" />
                  Installation Guide
                </h2>
                
                <div className="space-y-8">
                  {/* Step 1 */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">1</span>
                      Clone the Repository
                    </h3>
                    <p className="text-muted-foreground mb-3 text-sm">Download the code to your local machine.</p>
                    <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto">
                      <code className="text-sm font-mono text-primary">{`git clone https://github.com/itzTron/cyberx-project.git
cd cyberx-project`}</code>
                    </pre>
                  </div>

                  {/* Step 2 */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">2</span>
                      Install Frontend Dependencies
                    </h3>
                    <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto">
                      <code className="text-sm font-mono text-primary">{`npm install`}</code>
                    </pre>
                  </div>

                  {/* Step 3 */}
                  <div id="env-vars">
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">3</span>
                      Frontend Environment Setup
                    </h3>
                    <p className="text-muted-foreground mb-3 text-sm">Copy the template environment file and add your keys.</p>
                    <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto mb-4">
                      <code className="text-sm font-mono text-muted-foreground"># Windows (PowerShell)
Copy-Item .env.example .env

# Mac/Linux
cp .env.example .env</code>
                    </pre>
                    <p className="text-muted-foreground mb-2 text-sm">Open <code>.env</code> and configure your Supabase, OpenRouter, and (optional) Maps/LocationIQ keys.</p>
                  </div>

                  {/* Step 4 */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">4</span>
                      Set Up Auth Backend
                    </h3>
                    <p className="text-muted-foreground mb-3 text-sm">The OTP email authentication system runs as a separate Express server.</p>
                    <pre className="bg-background/50 border border-border rounded-lg p-4 overflow-x-auto mb-4">
                      <code className="text-sm font-mono text-primary">{`cd server
npm install
cp .env.example .env  # Or Copy-Item on Windows`}</code>
                    </pre>
                    <p className="text-muted-foreground mb-2 text-sm">Edit <code>server/.env</code> to include your <strong>Supabase Service Role Key</strong> (never expose this to the frontend) and Gmail SMTP credentials for OTP emails.</p>
                  </div>

                  {/* Step 5 */}
                  <div id="database">
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">5</span>
                      Database Setup (Supabase)
                    </h3>
                    <p className="text-muted-foreground mb-3 text-sm">You can use a hosted Supabase project (easier) or a local Docker setup.</p>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Hosted Project (Recommended)</h4>
                      <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                        <li>Create a project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">supabase.com</a></li>
                        <li>Copy your URL and Anon Key to the root <code>.env</code></li>
                        <li>Copy the Service Role Key to <code>server/.env</code></li>
                        <li>Run the SQL scripts located in <code>supabase/migrations/</code> via the Supabase SQL Editor</li>
                      </ol>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-sm">6</span>
                      Start Both Servers
                    </h3>
                    <p className="text-muted-foreground mb-3 text-sm">Open two terminal windows to run the frontend and backend simultaneously.</p>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-background/50 border border-border rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Terminal 1: Frontend</h4>
                        <pre className="overflow-x-auto"><code className="text-sm font-mono text-primary">npm run dev</code></pre>
                      </div>
                      <div className="bg-background/50 border border-border rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Terminal 2: Backend</h4>
                        <pre className="overflow-x-auto"><code className="text-sm font-mono text-primary">cd server
npm run dev</code></pre>
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-4 text-sm">The app will be available at <strong>http://localhost:8080</strong></p>
                  </div>

                </div>
              </GlassCard>

              {/* API Keys Guide */}
              <GlassCard id="api-keys">
                <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-3">
                  <Key className="w-6 h-6 text-primary" />
                  API Keys Guide
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">OpenRouter (Required for Tron AI Agent)</h3>
                    <p className="text-sm text-muted-foreground mb-2">Powers the built-in repository AI assistant.</p>
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                      <li>Sign up at <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="text-primary hover:underline">openrouter.ai</a></li>
                      <li>Create an API key from the dashboard</li>
                      <li>Add it to <code>.env</code> as <code>VITE_OPENROUTER_API_KEY</code></li>
                      <li>The default model is free — no credits needed</li>
                    </ol>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Gmail App Password (Required for OTP Auth)</h3>
                    <p className="text-sm text-muted-foreground mb-2">Required for the backend to send passwordless login codes.</p>
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                      <li>Enable <strong>2-Step Verification</strong> on your Google account</li>
                      <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-primary hover:underline">App Passwords</a></li>
                      <li>Create a new app password (e.g., named "CyberspaceX")</li>
                      <li>Copy the 16-character password into <code>server/.env</code> as <code>SMTP_PASS</code> (remove spaces)</li>
                      <li>Set <code>SMTP_USER</code> to your Gmail address</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">LocationIQ & Google Maps (Optional)</h3>
                    <p className="text-sm text-muted-foreground">
                      For the interactive profile location picker. Get a free key from <a href="https://locationiq.com/" target="_blank" rel="noreferrer" className="text-primary hover:underline">LocationIQ</a> (for geocoding) and Google Cloud Console (for the map visual). Add them as <code>VITE_LOCATIONIQ_API_KEY</code> and <code>VITE_GOOGLE_MAPS_API_KEY</code>.
                    </p>
                  </div>
                </div>
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
