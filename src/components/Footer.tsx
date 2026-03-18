import { Link } from 'react-router-dom';
import { Shield, Terminal, Github, FileText, Mail, Lock } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="border-t border-border bg-card/50 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="relative">
                <Shield className="w-8 h-8 text-primary" />
                <Terminal className="w-4 h-4 text-primary absolute -bottom-1 -right-1" />
              </div>
              <span className="text-xl font-bold font-mono">CyberX</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-md">
              Advanced cybersecurity toolkit designed for security professionals, 
              researchers, and enthusiasts. Built with security-first architecture 
              for comprehensive threat detection and analysis.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {[
                { to: '/features', label: 'Features' },
                { to: '/tools', label: 'Tools' },
                { to: '/download', label: 'Download' },
                { to: '/docs', label: 'Documentation' },
              ].map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/itzTron"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors text-sm flex items-center gap-2"
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </a>
              </li>
              <li>
                <Link
                  to="/docs"
                  className="text-muted-foreground hover:text-primary transition-colors text-sm flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-muted-foreground hover:text-primary transition-colors text-sm flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Contact
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className="text-muted-foreground hover:text-primary transition-colors text-sm flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Privacy
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2025 CyberX. Built for security research and education.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
