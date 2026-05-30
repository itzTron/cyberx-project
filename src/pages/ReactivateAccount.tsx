import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Check, LoaderCircle, RefreshCw, ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { verifyReactivationToken } from '@/lib/hubApi';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

type VerificationState = 'loading' | 'success' | 'already_active' | 'error';

const ReactivateAccount = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No reactivation token found. Please request a new reactivation link from the sign-in page.');
      return;
    }

    const verify = async () => {
      setState('loading');
      try {
        const result = await verifyReactivationToken(token);
        setMessage(result.message);
        setUsername(result.username);

        if (result.alreadyActive) {
          setState('already_active');
        } else {
          setState('success');
        }
      } catch (error) {
        setState('error');
        setMessage(error instanceof Error ? error.message : 'Failed to reactivate account. Please try again.');
      }
    };

    void verify();
  }, [token]);

  // Auto-redirect countdown after successful reactivation
  useEffect(() => {
    if (state !== 'success' && state !== 'already_active') return;
    if (countdown <= 0) {
      navigate(username ? `/signin` : '/signin', { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, countdown, navigate, username]);

  return (
    <div className="min-h-screen bg-background">
      <section className="pt-32 pb-20 relative">
        <div className="hero-gradient absolute inset-0" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto"
          >
            <GlassCard className="w-full">
              {/* Loading state */}
              {state === 'loading' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-primary/20 flex items-center justify-center">
                      <LoaderCircle className="h-8 w-8 text-primary animate-spin" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Reactivating Your Account</h2>
                    <p className="text-sm text-muted-foreground">
                      Please wait while we verify your reactivation link...
                    </p>
                  </div>
                </div>
              )}

              {/* Success state */}
              {state === 'success' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <div className="h-16 w-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
                      <Check className="h-8 w-8 text-green-400" />
                    </div>
                  </motion.div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Account Reactivated!</h2>
                    <p className="text-sm text-muted-foreground">
                      {message || 'Your account has been successfully reactivated.'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Redirecting to sign in in <span className="font-semibold text-primary">{countdown}s</span>...
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="mt-2 neon-border"
                    onClick={() => navigate('/signin', { replace: true })}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Sign In Now
                  </Button>
                </div>
              )}

              {/* Already active state */}
              {state === 'already_active' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <div className="h-16 w-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                      <ShieldCheck className="h-8 w-8 text-primary" />
                    </div>
                  </motion.div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Account Already Active</h2>
                    <p className="text-sm text-muted-foreground">
                      {message || 'Your account is already active. No action needed.'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Redirecting to sign in in <span className="font-semibold text-primary">{countdown}s</span>...
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="mt-2 neon-border"
                    onClick={() => navigate('/signin', { replace: true })}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Sign In Now
                  </Button>
                </div>
              )}

              {/* Error state */}
              {state === 'error' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <div className="h-16 w-16 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
                      <AlertTriangle className="h-8 w-8 text-destructive" />
                    </div>
                  </motion.div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-foreground">Reactivation Failed</h2>
                    <p className="text-sm text-muted-foreground">
                      {message || 'Unable to reactivate your account.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/signin', { replace: true })}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Back to Sign In
                    </Button>
                  </div>
                </div>
              )}
            </GlassCard>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Need help?{' '}
              <Link to="/contact" className="text-primary hover:underline">Contact support</Link>
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ReactivateAccount;
