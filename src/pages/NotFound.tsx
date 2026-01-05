import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, ArrowLeft, Shield, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrixRain from "@/components/MatrixRain";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center">
      <MatrixRain />
      <div className="matrix-scanline fixed inset-0 pointer-events-none z-10" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center z-20 px-4"
      >
        <div className="flex justify-center mb-8">
          <div className="relative">
            <Shield className="w-24 h-24 text-primary opacity-20" />
            <Terminal className="w-10 h-10 text-primary absolute bottom-0 right-0" />
          </div>
        </div>
        
        <h1 className="text-8xl font-bold font-mono text-primary neon-text mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-foreground mb-4">Access Denied</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved to a secure location.
        </p>
        
        <div className="flex gap-4 justify-center">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Link>
          </Button>
          <Button asChild className="neon-border">
            <Link to="/">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
