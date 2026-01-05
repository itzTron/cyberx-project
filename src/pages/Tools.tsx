import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SectionHeader from '@/components/SectionHeader';
import ToolCard from '@/components/ToolCard';
import { tools } from '@/data/tools';

const categories = ['All', 'Network Security', 'Threat Detection', 'Data Security', 'Communication', 'Compliance'];

const Tools = () => {
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
              TOOLS
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="text-foreground">Security </span>
              <span className="text-primary neon-text">Tools</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Explore our complete collection of cybersecurity tools. Each tool is designed 
              for specific security tasks and can be used independently or together.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="py-16 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

export default Tools;
