import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  id?: string;
}

const GlassCard = ({ children, className, hover = true, delay = 0, id }: GlassCardProps) => {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        hover ? 'glass-panel-hover' : 'glass-panel',
        'p-6',
        className
      )}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
