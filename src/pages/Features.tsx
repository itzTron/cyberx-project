import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import ToolCard from '@/components/ToolCard';
import GlassCard from '@/components/GlassCard';
import { tools } from '@/data/tools';
import { Shield, Zap, Code, Lock } from 'lucide-react';

const highlights = [
  {
    icon: Shield,
    title: 'Enterprise-Grade Security',
    description: 'Built with industry-standard encryption and security protocols.',
  },
  {
    icon: Zap,
    title: 'High Performance',
    description: 'Optimized algorithms for fast scanning and analysis.',
  },
  {
    icon: Code,
    title: 'Open Source',
    description: 'Transparent, auditable code you can trust and contribute to.',
  },
  {
    icon: Lock,
    title: 'Privacy First',
    description: 'Your data stays local. No telemetry, no tracking.',
  },
];

const Features = () => {
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
              FEATURES
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">Complete </span>
              <span className="text-primary neon-text">Security Suite</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              10+ powerful security tools designed for comprehensive protection, 
              analysis, and threat detection.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {highlights.map((item, index) => (
              <GlassCard key={item.title} delay={index * 0.1}>
                <item.icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* All Tools */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <SectionHeader
            badge="ALL TOOLS"
            title="Comprehensive Security Tools"
            description="Every tool you need for security research, testing, and protection."
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

      <Footer />
    </div>
  );
};

export default Features;
