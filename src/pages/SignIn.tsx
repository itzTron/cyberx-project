import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, Eye, EyeOff, Github, LoaderCircle,
  LockKeyhole, Mail, ShieldCheck, KeyRound, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AuthApiError, signInUser, signInWithGitHub } from '@/lib/authApi';
import { OtpApiError, sendOtp, verifyOtp } from '@/lib/otpApi';
import { extractAndStoreGitHubToken } from '@/lib/githubApi';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

type AuthTab = 'password' | 'otp';
type OtpStep = 'email' | 'verify';

const SignIn = () => {
  const navigate = useNavigate();

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AuthTab>('password');

  // ── Password form state ────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  // ── OTP flow state ─────────────────────────────────────────────────────────
  const [otpEmail, setOtpEmail] = useState('');
  const [otpEmailError, setOtpEmailError] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('email');
  const [otp, setOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Derived ────────────────────────────────────────────────────────────────
  const normalizedEmail = email.trim().toLowerCase();
  const hasEmailValue = normalizedEmail.length > 0;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const showEmailError = hasEmailValue && !isEmailValid && !fieldErrors.email;

  const isOtpEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim().toLowerCase());

  // ── Resend cooldown timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── OAuth callback (GitHub) ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          extractAndStoreGitHubToken(session);
          const meta = session.user.user_metadata;
          const fullName = (meta?.full_name as string | undefined)?.trim() || (meta?.name as string | undefined)?.trim() || '';
          const emailVal = session.user.email || '';
          const username =
            (meta?.user_name as string | undefined)?.trim() ||
            (meta?.preferred_username as string | undefined)?.trim() ||
            fullName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') ||
            emailVal.split('@')[0] || 'dashboard';
          navigate(`/${username}`);
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [navigate]);

  // ── Password sign-in ───────────────────────────────────────────────────────
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitSuccess('');
    setFormError('');
    const nextErrors: { email?: string; password?: string } = {};
    if (!normalizedEmail) nextErrors.email = 'Email address is required.';
    else if (!isEmailValid) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Password is required.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const response = await signInUser({ email: normalizedEmail, password });
      setSubmitSuccess(`${response.message} Logged in as ${response.user.email}.`);
      setEmail('');
      setPassword('');
      navigate(`/${response.user.username}`);
    } catch (error) {
      if (error instanceof AuthApiError) {
        if (error.field) setFieldErrors((c) => ({ ...c, [error.field!]: error.message }));
        else setFormError(error.message);
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
    } catch (error) {
      setFormError(error instanceof AuthApiError ? error.message : 'Unable to sign in with GitHub. Please try again.');
      setIsGitHubLoading(false);
    }
  };

  // ── OTP: send ─────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    setOtpEmailError('');
    setOtpSentMsg('');
    setOtpError('');
    if (!isOtpEmailValid) {
      setOtpEmailError('Enter a valid email address.');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await sendOtp(otpEmail.trim().toLowerCase());
      setOtpSentMsg(res.message);
      setOtpStep('verify');
      setOtp('');
      setResendCooldown(60);
    } catch (error) {
      setOtpEmailError(error instanceof OtpApiError ? error.message : 'Failed to send OTP. Please try again.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ── OTP: resend ────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtpSentMsg('');
    setIsSendingOtp(true);
    try {
      const res = await sendOtp(otpEmail.trim().toLowerCase());
      setOtpSentMsg(res.message);
      setOtp('');
      setOtpAttemptsLeft(null);
      setResendCooldown(60);
    } catch (error) {
      setOtpError(error instanceof OtpApiError ? error.message : 'Failed to resend OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ── OTP: verify ────────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }
    setOtpError('');
    setIsVerifyingOtp(true);
    try {
      const res = await verifyOtp(otpEmail.trim().toLowerCase(), otp);
      navigate(`/${res.user.username}`);
    } catch (error) {
      if (error instanceof OtpApiError) {
        setOtpError(error.message);
        if (error.attemptsRemaining !== undefined) setOtpAttemptsLeft(error.attemptsRemaining);
        if (error.code === 'MAX_ATTEMPTS_REACHED' || error.code === 'OTP_EXPIRED') {
          setOtpStep('email');
          setOtp('');
          setOtpAttemptsLeft(null);
        }
      } else {
        setOtpError('Verification failed. Please try again.');
      }
    } finally {
      setIsVerifyingOtp(false);
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
            {/* Left column */}
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
                  <p className="text-sm text-muted-foreground">Protected sessions and secure access for your toolkit.</p>
                </div>
                <div className="flex items-start gap-3">
                  <LockKeyhole className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">Centralize scans, reports, and monitoring from one account.</p>
                </div>
                <div className="flex items-start gap-3">
                  <KeyRound className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">Sign in passwordlessly with a one-time code sent to your email.</p>
                </div>
              </div>
            </div>

            {/* Right column — card */}
            <GlassCard className="w-full max-w-md lg:ml-auto">
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose how you'd like to sign in.</p>
              </div>

              {/* GitHub */}
              <Button
                id="github-signin-button"
                type="button"
                size="lg"
                variant="outline"
                className="w-full mb-5 gap-2.5 border-border bg-muted/30 hover:bg-muted/60 transition-all duration-200"
                disabled={isGitHubLoading || isSubmitting || isSendingOtp || isVerifyingOtp}
                onClick={handleGitHubSignIn}
              >
                {isGitHubLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Github className="h-5 w-5" />}
                {isGitHubLoading ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
              </Button>

              {/* Divider */}
              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground font-medium">or continue with</span>
                </div>
              </div>

              {/* Tab switcher */}
              <div className="flex rounded-lg border border-border bg-muted/30 p-1 mb-5 gap-1">
                <button
                  id="signin-tab-password"
                  type="button"
                  onClick={() => { setActiveTab('password'); setFormError(''); setSubmitSuccess(''); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'password'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Password
                </button>
                <button
                  id="signin-tab-otp"
                  type="button"
                  onClick={() => { setActiveTab('otp'); setOtpError(''); setOtpSentMsg(''); setOtpStep('email'); setOtp(''); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'otp'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email OTP
                </button>
              </div>

              {/* ── Password tab ── */}
              {activeTab === 'password' && (
                <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                  <div>
                    <label htmlFor="signin-email" className="block text-sm font-medium text-foreground mb-2">Email</label>
                    <div className="relative">
                      <Input
                        id="signin-email"
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFieldErrors((c) => ({ ...c, email: undefined })); }}
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
                    {!fieldErrors.email && showEmailError && <p className="mt-2 text-sm text-destructive">Email ID is not valid.</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="signin-password" className="block text-sm font-medium text-foreground">Password</label>
                      <Link to="/contact" className="text-sm text-primary hover:underline">Forgot password?</Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setFieldErrors((c) => ({ ...c, password: undefined })); }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        aria-invalid={Boolean(fieldErrors.password)}
                        className={cn('bg-muted/50 border-border pr-10', fieldErrors.password && 'border-destructive focus-visible:ring-destructive/40')}
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
                    ) : 'Sign In'}
                  </Button>
                </form>
              )}

              {/* ── OTP tab ── */}
              {activeTab === 'otp' && (
                <div className="space-y-5">
                  {otpStep === 'email' && (
                    <>
                      <div>
                        <label htmlFor="otp-email" className="block text-sm font-medium text-foreground mb-2">
                          Email address
                        </label>
                        <Input
                          id="otp-email"
                          type="email"
                          value={otpEmail}
                          onChange={(e) => { setOtpEmail(e.target.value); setOtpEmailError(''); }}
                          placeholder="you@gmail.com"
                          autoComplete="email"
                          className={cn(
                            'bg-muted/50 border-border',
                            otpEmailError && 'border-destructive focus-visible:ring-destructive/40',
                            isOtpEmailValid && otpEmail.length > 0 && 'border-primary focus-visible:ring-primary/40',
                          )}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSendOtp(); } }}
                        />
                        {otpEmailError && <p className="mt-2 text-sm text-destructive">{otpEmailError}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">A 6-digit code will be sent to this address.</p>
                      </div>
                      <Button
                        id="otp-send-button"
                        type="button"
                        size="lg"
                        className="w-full neon-border"
                        disabled={isSendingOtp || !otpEmail.trim()}
                        onClick={() => void handleSendOtp()}
                      >
                        {isSendingOtp ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Sending code...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Send OTP
                          </span>
                        )}
                      </Button>
                    </>
                  )}

                  {otpStep === 'verify' && (
                    <>
                      {/* Success banner */}
                      {otpSentMsg && (
                        <div className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 text-sm text-primary">
                          <Check className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{otpSentMsg} Check <strong>{otpEmail}</strong>.</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">
                          Enter 6-digit code
                        </label>
                        <div className="flex justify-center">
                          <InputOTP
                            id="otp-input"
                            maxLength={6}
                            value={otp}
                            onChange={(val) => { setOtp(val); setOtpError(''); }}
                            onComplete={() => void handleVerifyOtp()}
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                        {otpError && <p className="mt-3 text-sm text-destructive text-center">{otpError}</p>}
                        {otpAttemptsLeft !== null && otpAttemptsLeft > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground text-center">
                            {otpAttemptsLeft} attempt{otpAttemptsLeft !== 1 ? 's' : ''} remaining
                          </p>
                        )}
                      </div>

                      <Button
                        id="otp-verify-button"
                        type="button"
                        size="lg"
                        className="w-full neon-border"
                        disabled={isVerifyingOtp || otp.length !== 6}
                        onClick={() => void handleVerifyOtp()}
                      >
                        {isVerifyingOtp ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Verifying...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            Verify & Sign In
                          </span>
                        )}
                      </Button>

                      {/* Resend + change email */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => { setOtpStep('email'); setOtp(''); setOtpError(''); setOtpSentMsg(''); setOtpAttemptsLeft(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                        >
                          Change email
                        </button>
                        <button
                          id="otp-resend-button"
                          type="button"
                          disabled={resendCooldown > 0 || isSendingOtp}
                          onClick={() => void handleResendOtp()}
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs transition-colors',
                            resendCooldown > 0 || isSendingOtp
                              ? 'text-muted-foreground cursor-not-allowed'
                              : 'text-primary hover:underline underline-offset-2 cursor-pointer',
                          )}
                        >
                          <RefreshCw className={cn('h-3 w-3', isSendingOtp && 'animate-spin')} />
                          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <p className="text-sm text-muted-foreground mt-6 text-center">
                Need an account?{' '}
                <Link to="/signup" className="text-primary hover:underline">Create one</Link>
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
