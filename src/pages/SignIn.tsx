import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff, Github, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthApiError, signInUser, signInWithGitHub } from '@/lib/authApi';
import { extractAndStoreGitHubToken } from '@/lib/githubApi';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

const SignIn = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const normalizedEmail = email.trim().toLowerCase();
  const hasEmailValue = normalizedEmail.length > 0;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const showEmailError = hasEmailValue && !isEmailValid && !fieldErrors.email;

  /* ---- Handle OAuth callback (GitHub redirect lands back here) ---- */
  useEffect(() => {
    const supabase = getSupabaseClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          // Capture the GitHub provider_token from the OAuth callback
          extractAndStoreGitHubToken(session);

          // Resolve username for navigation
          const fullName =
            (session.user.user_metadata?.full_name as string | undefined)?.trim() ||
            (session.user.user_metadata?.name as string | undefined)?.trim() ||
            '';
          const emailVal = session.user.email || '';
          const username =
            (session.user.user_metadata?.user_name as string | undefined)?.trim() ||
            (session.user.user_metadata?.preferred_username as string | undefined)?.trim() ||
            fullName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') ||
            emailVal.split('@')[0] || 'dashboard';

          navigate(`/${username}`);
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitSuccess('');
    setFormError('');

    const nextFieldErrors: {
      email?: string;
      password?: string;
    } = {};

    if (!normalizedEmail) {
      nextFieldErrors.email = 'Email address is required.';
    } else if (!isEmailValid) {
      nextFieldErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      nextFieldErrors.password = 'Password is required.';
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await signInUser({
        email: normalizedEmail,
        password,
      });

      setSubmitSuccess(`${response.message} Logged in as ${response.user.email}.`);
      setEmail('');
      setPassword('');
      navigate(`/${response.user.username}`);
    } catch (error) {
      if (error instanceof AuthApiError) {
        if (error.field) {
          setFieldErrors((current) => ({
            ...current,
            [error.field]: error.message,
          }));
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Unable to sign in right now. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setFormError('');
    setIsGitHubLoading(true);

    try {
      await signInWithGitHub();
      // The function triggers a redirect — we won't reach here unless there's an error
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFormError(error.message);
      } else {
        setFormError('Unable to sign in with GitHub. Please try again.');
      }
      setIsGitHubLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">


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
                SIGN IN
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                <span className="text-foreground">Access your </span>
                <span className="text-primary neon-text">Cyberspace-X 2.0</span>
                <br />
                <span className="text-foreground">workspace</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Continue to your dashboard to manage tools, review alerts, and
                keep your security workflows in one place.
              </p>

              <div className="mt-8 space-y-4 max-w-md">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Protected sessions and secure access for your toolkit.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <LockKeyhole className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Centralize scans, reports, and monitoring from one account.
                  </p>
                </div>
              </div>
            </div>

            <GlassCard className="w-full max-w-md lg:ml-auto">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Enter your credentials to sign in.
                </p>
              </div>

              {/* ── GitHub OAuth Button ── */}
              <Button
                id="github-signin-button"
                type="button"
                size="lg"
                variant="outline"
                className="w-full mb-5 gap-2.5 border-border bg-muted/30 hover:bg-muted/60 transition-all duration-200"
                disabled={isGitHubLoading || isSubmitting}
                onClick={handleGitHubSignIn}
              >
                {isGitHubLoading ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Github className="h-5 w-5" />
                )}
                {isGitHubLoading ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
              </Button>

              {/* ── Divider ── */}
              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground font-medium">
                    or continue with email
                  </span>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div>
                  <label htmlFor="signin-email" className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setFieldErrors((current) => ({ ...current, email: undefined }));
                      }}
                      placeholder="you@company.com"
                      autoComplete="email"
                      aria-invalid={Boolean(fieldErrors.email) || showEmailError}
                      className={cn(
                        'bg-muted/50 border-border pr-10',
                        (fieldErrors.email || showEmailError) && 'border-destructive focus-visible:ring-destructive/40',
                        isEmailValid && 'border-primary focus-visible:ring-primary/40',
                      )}
                    />
                    {isEmailValid && (
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  {fieldErrors.email && <p className="mt-2 text-sm text-destructive">{fieldErrors.email}</p>}
                  {!fieldErrors.email && showEmailError && (
                    <p className="mt-2 text-sm text-destructive">Email ID is not valid.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="signin-password" className="block text-sm font-medium text-foreground">
                      Password
                    </label>
                    <Link to="/contact" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFieldErrors((current) => ({ ...current, password: undefined }));
                      }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      aria-invalid={Boolean(fieldErrors.password)}
                      className={cn(
                        'bg-muted/50 border-border pr-10',
                        fieldErrors.password && 'border-destructive focus-visible:ring-destructive/40',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="mt-2 text-sm text-destructive">{fieldErrors.password}</p>}
                </div>

                {formError && <p className="text-sm text-destructive">{formError}</p>}
                {submitSuccess && <p className="text-sm text-primary">{submitSuccess}</p>}

                <Button type="submit" size="lg" className="w-full neon-border" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground mt-6 text-center">
                Need an account?{' '}
                <Link to="/signup" className="text-primary hover:underline">
                  Create one
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

export default SignIn;
