import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Lock, Shield, Terminal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MatrixRain from '@/components/MatrixRain';

import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import GlassCard from '@/components/GlassCard';
import { listPublicToolRepositories } from '@/lib/hubApi';
import { isSupabaseConfigured } from '@/lib/supabase';

const TYPEWRITER_TEXT = '2.0';
const TYPING_SPEED = 200;
const START_DELAY = 1200;

// ── Animated counter ─────────────────────────────────────────────────────────
const AnimatedCounter = ({ target }: { target: number }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const duration = 900; // ms
    const step = 16; // ~60fps
    const increment = target / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setDisplay(target);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start));
      }
    }, step);
    return () => clearInterval(timer);
  }, [target]);

  return <>{display}</>;
};

const Index = () => {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [doneTyping, setDoneTyping] = useState(false);
  const [repoCount, setRepoCount] = useState<number | null>(null);

  // ── Typewriter ─────────────────────────────────────────────────────────────
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

  // ── Cursor blink ───────────────────────────────────────────────────────────
  useEffect(() => {
    const blink = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  // ── Fetch live public repo count ───────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    listPublicToolRepositories()
      .then((repos) => setRepoCount(repos.length))
      .catch(() => setRepoCount(null));
  }, []);

  const stats = [
    {
      value: repoCount,
      label: 'Repos',
      icon: Shield,
      href: '/tools',
      isLive: true,
    },
    { value: null, label: 'Open Source', icon: Terminal, display: '100%' },
    { value: null, label: 'Encryption', icon: Lock, display: 'AES-256' },
    { value: null, label: 'Performance', icon: Zap, display: 'Fast' },
  ] as const;

  return (
    <div className="min-h-screen bg-background relative">
      <MatrixRain />
      <div className="matrix-scanline fixed inset-0 pointer-events-none z-10" />

      <section className="relative min-h-screen flex items-center justify-center pt-24 md:pt-28">
        <div className="container mx-auto px-4 relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
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
              <Button asChild size="lg" className="neon-border">
                <Link to="/tools">
                  Get Started Free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/docs">Read Documentation</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat, index) => {
                const inner = (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                    className={[
                      'glass-panel p-4 text-center transition-all duration-200',
                      'href' in stat
                        ? 'cursor-pointer hover:border-primary/60 hover:bg-primary/5 hover:shadow-[0_0_18px_hsl(var(--primary)/0.25)]'
                        : '',
                    ].join(' ')}
                  >
                    <stat.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                    <div className="text-2xl font-bold text-foreground font-mono">
                      {'isLive' in stat && stat.isLive ? (
                        repoCount === null ? (
                          <span className="text-muted-foreground text-lg">—</span>
                        ) : (
                          <AnimatedCounter target={repoCount} />
                        )
                      ) : (
                        stat.display
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                    {'href' in stat && (
                      <p className="text-[10px] text-primary/60 mt-1 font-mono tracking-wide">
                        view all →
                      </p>
                    )}
                  </motion.div>
                );

                return 'href' in stat ? (
                  <Link key={stat.label} to={stat.href}>
                    {inner}
                  </Link>
                ) : (
                  inner
                );
              })}
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

      <Footer />
    </div>
  );
};

export default Index;
