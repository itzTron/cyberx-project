import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';
import { roadmapItems, RoadmapItem } from '@/data/roadmap';

const statusIcons = {
  'Completed': CheckCircle2,
  'In Progress': Clock,
  'Planned': Circle,
};

const statusColors = {
  'Completed': 'text-primary bg-primary/20',
  'In Progress': 'text-cyber-cyan bg-cyber-cyan/20',
  'Planned': 'text-muted-foreground bg-muted',
};

const phases = ['Current Semester', 'Next Phase', 'Future'];

const Roadmap = () => {
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
              ROADMAP
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">Development </span>
              <span className="text-primary neon-text">Roadmap</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Track our progress and see what's coming next. We're constantly 
              improving CyberX with new features and enhancements.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {phases.map((phase, phaseIndex) => {
              const phaseItems = roadmapItems.filter(item => item.phase === phase);
              
              return (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: phaseIndex * 0.1 }}
                  className="mb-12"
                >
                  {/* Phase Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-4 h-4 rounded-full ${
                      phase === 'Current Semester' 
                        ? 'bg-primary animate-pulse' 
                        : phase === 'Next Phase' 
                          ? 'bg-cyber-cyan' 
                          : 'bg-muted-foreground'
                    }`} />
                    <h2 className="text-2xl font-bold text-foreground">{phase}</h2>
                  </div>

                  {/* Items */}
                  <div className="ml-2 border-l-2 border-border pl-8 space-y-4">
                    {phaseItems.map((item, index) => {
                      const StatusIcon = statusIcons[item.status];
                      
                      return (
                        <GlassCard key={item.id} delay={index * 0.05}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-foreground">
                                  {item.title}
                                </h3>
                                <span className={`text-xs font-mono px-2 py-1 rounded ${
                                  item.priority === 'High' 
                                    ? 'bg-primary/20 text-primary' 
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {item.priority}
                                </span>
                              </div>
                              <p className="text-muted-foreground">{item.description}</p>
                            </div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${statusColors[item.status]}`}>
                              <StatusIcon className="w-4 h-4" />
                              <span className="text-xs font-medium">{item.status}</span>
                            </div>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Roadmap;
