import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldPlus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

const SignUp = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-20 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center"
          >
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/30 mb-4">
                SIGN UP
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                <span className="text-foreground">Create your </span>
                <span className="text-primary neon-text">CyberX</span>
                <br />
                <span className="text-foreground">account</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Set up your account to organize assessments, download releases,
                and start using the CyberX platform from one secure entry point.
              </p>

              <div className="mt-8 space-y-4 max-w-md">
                <div className="flex items-start gap-3">
                  <ShieldPlus className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Keep projects, reports, and tool access tied to one profile.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <UserPlus className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Start with a simple registration flow and expand later.
                  </p>
                </div>
              </div>
            </div>

            <GlassCard className="w-full max-w-md lg:ml-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Create account</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Fill in your details to get started.
                </p>
              </div>

              <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
                <div>
                  <label htmlFor="signup-name" className="block text-sm font-medium text-foreground mb-2">
                    Full name
                  </label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Your full name"
                    className="bg-muted/50 border-border"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@company.com"
                    className="bg-muted/50 border-border"
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-sm font-medium text-foreground mb-2">
                    Password
                  </label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password"
                    className="bg-muted/50 border-border"
                  />
                </div>

                <Button type="submit" size="lg" className="w-full neon-border">
                  Sign Up
                </Button>
              </form>

              <p className="text-sm text-muted-foreground mt-6 text-center">
                Already have an account?{' '}
                <Link to="/signin" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default SignUp;
