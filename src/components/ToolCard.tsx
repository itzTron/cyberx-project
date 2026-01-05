import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  slug: string;
  features?: string[];
  delay?: number;
  variant?: 'default' | 'compact';
}

const ToolCard = ({ 
  icon: Icon, 
  title, 
  description, 
  slug, 
  features,
  delay = 0,
  variant = 'default'
}: ToolCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
    >
      <Link
        to={`/tools/${slug}`}
        className={cn(
          'group block glass-panel-hover',
          variant === 'default' ? 'p-6' : 'p-4'
        )}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 group-hover:border-primary/40 transition-all">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors flex items-center gap-2">
              {title}
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </h3>
            <p className="text-muted-foreground text-sm mb-3">{description}</p>
            {features && variant === 'default' && (
              <div className="flex flex-wrap gap-2">
                {features.slice(0, 4).map((feature) => (
                  <span
                    key={feature}
                    className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground font-mono"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default ToolCard;
