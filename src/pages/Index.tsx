import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Lock, Shield, Terminal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MatrixRain from '@/components/MatrixRain';

import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import ToolCard from '@/components/ToolCard';
import GlassCard from '@/components/GlassCard';
import { tools } from '@/data/tools';

const TYPEWRITER_TEXT = '2.0';
const TYPING_SPEED = 200;    // ms per character
const START_DELAY = 1200;     // ms before typing begins

const stats = [
  { value: '4', label: 'Security Tools', icon: Shield },
  { value: '100%', label: 'Open Source', icon: Terminal },
  { value: 'AES-256', label: 'Encryption', icon: Lock },
  { value: 'Fast', label: 'Performance', icon: Zap },
];

const Index = () => {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [doneTyping, setDoneTyping] = useState(false);

  useEffect(() => {
    let charIndex = 0;

    const startTimeout = setTimeout(() => {
      const interval = setInterval(() => {
        charIndex++;
        setDisplayedText(TYPEWRITER_TEXT.slice(0, charIndex));
        if (charIndex >= TYPEWRITER_TEXT.length) {
          clearInterval(interval);
          setDoneTyping(true);
        }
      }, TYPING_SPEED);

      return () => clearInterval(interval);
    }, START_DELAY);

    return () => clearTimeout(startTimeout);
  }, []);

  // Blink the cursor
  useEffect(() => {
    const blink = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <div className="min-h-screen bg-background relative">
      <MatrixRain />
      <div className="matrix-scanline fixed inset-0 pointer-events-none z-10" />



      <section className="relative min-h-screen flex items-center justify-center pt-16">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-mono text-primary">v0.1.0-alpha | Security First</span>
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="text-primary neon-text">
                Cyberspace-X{' '}
                <span className="typewriter-version">
                  {displayedText}
                  <span
                    className="typewriter-cursor"
                    style={{ opacity: showCursor ? 1 : 0 }}
                  >
                    |
                  </span>
                </span>
              </span>
              <br />
              <span className="text-foreground">Security Platform</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              A practical security platform built around the CyberX toolkit for network analysis, threat detection,
              and secure operational workflows.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Button asChild size="lg" className="neon-border text-lg px-8">
                <Link to="/download">
                  Download CyberX
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8">
                <Link to="/features">View Features</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                  className="glass-panel p-4 text-center"
                >
                  <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold text-foreground font-mono">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <ChevronDown className="w-8 h-8 text-primary animate-bounce" />
          </motion.div>
        </div>
      </section>

      <section className="py-24 relative z-20">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="SECURITY SUITE"
            title="Powerful Security Tools"
            description="Cyberspace-X 2.0 provides a focused set of security tools designed to protect, analyze, and secure your digital infrastructure."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.slice(0, 6).map((tool, index) => (
              <ToolCard
                key={tool.slug}
                icon={tool.icon}
                title={tool.name}
                description={tool.shortDescription}
                slug={tool.slug}
                features={tool.features}
                delay={index * 0.1}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Button asChild variant="outline" size="lg">
              <Link to="/tools">
                View All Tools
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="py-24 relative z-20 cyber-gradient">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="WHY CYBERSPACE-X 2.0"
            title="Security-First Architecture"
            description="Built from the ground up with security as the primary focus, not an afterthought."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard delay={0}>
              <div className="text-primary text-4xl font-bold font-mono mb-4">01</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Open Source</h3>
              <p className="text-muted-foreground">
                Fully transparent codebase. Review, audit, and contribute to the security of the tools you use.
              </p>
            </GlassCard>

            <GlassCard delay={0.1}>
              <div className="text-primary text-4xl font-bold font-mono mb-4">02</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Education Focused</h3>
              <p className="text-muted-foreground">
                Designed for learning and research. Perfect for students and security enthusiasts.
              </p>
            </GlassCard>

            <GlassCard delay={0.2}>
              <div className="text-primary text-4xl font-bold font-mono mb-4">03</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Modular Design</h3>
              <p className="text-muted-foreground">
                Use only what you need. Each tool works independently or as part of the complete suite.
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      <section className="py-24 relative z-20">
        <div className="container mx-auto px-4">
          <GlassCard className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Ready to Secure Your Systems?</h2>
            <p className="text-muted-foreground text-lg mb-8">
              Start with CyberX and expand with specialized security tools across the Cyberspace-X 2.0 platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="neon-border">
                <Link to="/download">
                  Get Started Free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/docs">Read Documentation</Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
