import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, Eye, EyeOff, LoaderCircle, ShieldPlus, UserPlus,
  Mail, KeyRound, ShieldCheck, RefreshCw, BadgeCheck, Send,
} from 'lucide-react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';
import { getSupportedEmailDomains, validateSignUpEmail } from '@/lib/emailValidation';
import { AuthApiError, signUpUser } from '@/lib/authApi';
import { OtpApiError, sendOtp, verifyOtp } from '@/lib/otpApi';
import { signInWithGitHub } from '@/lib/authApi';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

type EmailVerifyStep = 'idle' | 'sending' | 'otp' | 'verified';

const SignUp = () => {
  const navigate = useNavigate();

  // ── Form fields ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Submit state ──────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  // ── GitHub ────────────────────────────────────────────────────────────────
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState('');

  // ── Email OTP inline verification ─────────────────────────────────────────
  const [emailVerifyStep, setEmailVerifyStep] = useState<EmailVerifyStep>('idle');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── Email live validation ──────────────────────────────────────────────────
  const supportedDomains = useMemo(() => getSupportedEmailDomains(), []);
  const emailValidation = useMemo(() => validateSignUpEmail(email), [email]);
  const showEmailFeedback = email.trim().length > 0;
  const showEmailError = showEmailFeedback && !emailValidation.isValid;
  const showEmailSuccess = showEmailFeedback && emailValidation.isValid && emailVerifyStep !== 'verified';

  // When email changes, reset verification
  const handleEmailChange = (val: string) => {
    setEmail(val);
    setFieldErrors((c) => ({ ...c, email: undefined }));
    if (emailVerifyStep !== 'idle') {
      setEmailVerifyStep('idle');
      setOtp('');
      setOtpError('');
      setOtpSentMsg('');
      setOtpAttemptsLeft(null);
    }
  };

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!emailValidation.isValid) return;
    setOtpError(''); setOtpSentMsg(''); setIsSendingOtp(true);
    setEmailVerifyStep('sending');
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setOtpSentMsg(res.message);
      setEmailVerifyStep('otp');
      setOtp('');
      setResendCooldown(60);
    } catch (err) {
      setOtpError(err instanceof OtpApiError ? err.message : 'Failed to send OTP.');
      setEmailVerifyStep('idle');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError(''); setOtpSentMsg(''); setIsSendingOtp(true);
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setOtpSentMsg(res.message); setOtp(''); setOtpAttemptsLeft(null); setResendCooldown(60);
    } catch (err) {
      setOtpError(err instanceof OtpApiError ? err.message : 'Failed to resend OTP.');
    } finally { setIsSendingOtp(false); }
  };

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpError(''); setIsVerifyingOtp(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp);
      setEmailVerifyStep('verified');
      setOtpError('');
    } catch (err) {
      if (err instanceof OtpApiError) {
        setOtpError(err.message);
        if (err.attemptsRemaining !== undefined) setOtpAttemptsLeft(err.attemptsRemaining);
        if (err.code === 'MAX_ATTEMPTS_REACHED' || err.code === 'OTP_EXPIRED') {
          setEmailVerifyStep('idle'); setOtp(''); setOtpAttemptsLeft(null);
        }
      } else { setOtpError('Verification failed. Please try again.'); }
    } finally { setIsVerifyingOtp(false); }
  };

  // ── Password form submit ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitSuccess(''); setFormError('');

    const errs: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) errs.name = 'Full name is required.';
    if (!emailValidation.isValid) errs.email = emailValidation.message;
    if (emailVerifyStep !== 'verified') errs.email = 'Please verify your email with the OTP first.';

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!hasLetter || !hasNumber || !hasSpecial)
      errs.password = 'Password must contain letters, numbers, and a special character.';

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await signUpUser({ name, email, password });
      setSubmitSuccess(
        response.emailConfirmationRequired
          ? `Account created! An activation email has been sent to ${response.user.email}. Check your inbox to activate your account.`
          : `Account created successfully! Welcome to Cyberspace-X.`
      );
      setName(''); setEmail(''); setPassword('');
      setEmailVerifyStep('idle');
      if (!response.emailConfirmationRequired) {
        setTimeout(() => navigate(`/${response.user.username}`), 1500);
      }
    } catch (err) {
      if (err instanceof AuthApiError) {
        if (err.field) setFieldErrors((c) => ({ ...c, [err.field!]: err.message }));
        else setFormError(err.message);
      } else {
        setFormError('Unable to create account right now. Please try again.');
      }
    } finally { setIsSubmitting(false); }
  };

  const handleGitHubSignUp = async () => {
    setGithubError(''); setIsGithubLoading(true);
    try {
      await signInWithGitHub();
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'GitHub sign-up failed.');
      setIsGithubLoading(false);
    }
  };

  const isEmailLocked = emailVerifyStep === 'verified' || emailVerifyStep === 'otp';
  const isAnythingLoading = isSubmitting || isSendingOtp || isVerifyingOtp || isGithubLoading;

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
            {/* Left hero text */}
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/30 mb-4">
                SIGN UP
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                <span className="text-foreground">Create your </span>
                <span className="text-primary neon-text">Cyberspace-X 2.0</span>
                <br />
                <span className="text-foreground">account</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl">
                Set up your account to organize assessments, download releases,
                and start using the Cyberspace-X 2.0 platform from one secure entry point.
              </p>
              <div className="mt-8 space-y-4 max-w-md">
                <div className="flex items-start gap-3">
                  <ShieldPlus className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">Keep projects, reports, and tool access tied to one profile.</p>
                </div>
                <div className="flex items-start gap-3">
                  <UserPlus className="w-5 h-5 text-primary mt-0.5" />
                  <p className="text-sm text-muted-foreground">Start with a simple registration flow and expand later.</p>
                </div>
              </div>
            </div>

            {/* Right card */}
            <GlassCard className="w-full max-w-md lg:ml-auto">
              <div className="mb-5">
                <h2 className="text-2xl font-bold text-foreground">Create account</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Set up your account to get started on Cyberspace-X 2.0.
                </p>
              </div>

              {/* GitHub OAuth */}
              <Button
                id="signup-github"
                type="button"
                variant="outline"
                size="lg"
                className="w-full gap-3 border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => void handleGitHubSignUp()}
                disabled={isAnythingLoading}
              >
                {isGithubLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                {isGithubLoading ? 'Redirecting to GitHub...' : 'Sign up with GitHub'}
              </Button>
              {githubError && <p className="text-sm text-destructive mt-2">{githubError}</p>}

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground font-mono tracking-widest uppercase">or sign up with email</span>
                </div>
              </div>

              {/* ── Unified Sign-Up Form ── */}
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>

                {/* Name */}
                <div>
                  <label htmlFor="signup-name" className="block text-sm font-medium text-foreground mb-2">Full name</label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFieldErrors((c) => ({ ...c, name: undefined })); }}
                    placeholder="Your full name"
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    className={cn('bg-muted/50 border-border', fieldErrors.name && 'border-destructive focus-visible:ring-destructive/40')}
                  />
                  {fieldErrors.name && <p className="mt-2 text-sm text-destructive">{fieldErrors.name}</p>}
                </div>

                {/* Email + OTP verification */}
                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-foreground mb-2">Email</label>

                  <div className="flex gap-2 items-start">
                    <div className="relative flex-1">
                      <Input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        placeholder="you@gmail.com"
                        autoComplete="email"
                        disabled={isEmailLocked}
                        aria-invalid={Boolean(fieldErrors.email) || showEmailError}
                        className={cn(
                          'bg-muted/50 border-border pr-9',
                          !isEmailLocked && (fieldErrors.email || showEmailError) && 'border-destructive focus-visible:ring-destructive/40',
                          !isEmailLocked && showEmailSuccess && 'border-primary focus-visible:ring-primary/40',
                          emailVerifyStep === 'verified' && 'border-green-500/60 focus-visible:ring-green-500/30 opacity-80',
                          isEmailLocked && 'cursor-not-allowed',
                        )}
                      />
                      {/* Status icon inside input */}
                      {emailVerifyStep === 'verified' && (
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-green-500">
                          <BadgeCheck className="h-4 w-4" />
                        </span>
                      )}
                      {emailVerifyStep !== 'verified' && showEmailSuccess && (
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </div>

                    {/* Send OTP button — only show when email valid & not yet verified/in-otp */}
                    {emailVerifyStep === 'idle' && emailValidation.isValid && (
                      <Button
                        id="signup-send-otp"
                        type="button"
                        size="default"
                        variant="outline"
                        className="shrink-0 border-primary/50 text-primary hover:bg-primary/10 gap-1.5"
                        onClick={() => void handleSendOtp()}
                        disabled={isSendingOtp}
                      >
                        {isSendingOtp
                          ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          : <Send className="h-3.5 w-3.5" />}
                        Send OTP
                      </Button>
                    )}

                    {/* Verified badge button */}
                    {emailVerifyStep === 'verified' && (
                      <div className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-green-500 bg-green-500/10 border border-green-500/30">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified
                      </div>
                    )}
                  </div>

                  {/* Error / hint messages */}
                  {fieldErrors.email && <p className="mt-2 text-sm text-destructive">{fieldErrors.email}</p>}
                  {!fieldErrors.email && showEmailError && <p className="mt-2 text-sm text-destructive">{emailValidation.message}</p>}
                  {!showEmailError && emailVerifyStep === 'idle' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Supported domains: {supportedDomains.join(', ')}.
                    </p>
                  )}

                  {/* ── OTP Pane (animated drop-down) ── */}
                  <AnimatePresence>
                    {emailVerifyStep === 'otp' && (
                      <motion.div
                        key="otp-pane"
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                          {/* Sent message */}
                          {otpSentMsg && (
                            <div className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-primary">
                              <Check className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>{otpSentMsg} Check <strong>{email}</strong>.</span>
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-foreground mb-3">
                              <KeyRound className="h-3.5 w-3.5 inline mr-1.5 text-primary" />
                              Enter the 6-digit code
                            </label>
                            <div className="flex justify-center">
                              <InputOTP
                                id="signup-otp-input"
                                maxLength={6}
                                value={otp}
                                onChange={(val) => { setOtp(val); setOtpError(''); }}
                                onComplete={() => void handleVerifyOtp()}
                              >
                                <InputOTPGroup>
                                  <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                                  <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                                </InputOTPGroup>
                              </InputOTP>
                            </div>
                            {otpError && <p className="mt-3 text-sm text-destructive text-center">{otpError}</p>}
                            {otpAttemptsLeft !== null && otpAttemptsLeft > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground text-center">{otpAttemptsLeft} attempt{otpAttemptsLeft !== 1 ? 's' : ''} remaining</p>
                            )}
                          </div>

                          <Button
                            id="signup-otp-verify"
                            type="button"
                            size="sm"
                            className="w-full neon-border"
                            disabled={isVerifyingOtp || otp.length !== 6}
                            onClick={() => void handleVerifyOtp()}
                          >
                            {isVerifyingOtp
                              ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Verifying...</span>
                              : <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Verify Email</span>}
                          </Button>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={() => { setEmailVerifyStep('idle'); setOtp(''); setOtpError(''); setOtpSentMsg(''); setOtpAttemptsLeft(null); }}
                              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                            >
                              Change email
                            </button>
                            <button
                              id="signup-otp-resend"
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
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Password — show always so user can fill it in parallel */}
                <div>
                  <label htmlFor="signup-password" className="block text-sm font-medium text-foreground mb-2">Password</label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((c) => ({ ...c, password: undefined })); }}
                      placeholder="Create a password"
                      autoComplete="new-password"
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
                  {password.length > 0 && (
                    <div className="mt-3 space-y-1.5 text-xs">
                      {[
                        [password.length >= 8, 'At least 8 characters'],
                        [/[a-zA-Z]/.test(password), 'Contains a letter'],
                        [/\d/.test(password), 'Contains a number'],
                        [/[!@#$%^&*(),.?":{}|<>]/.test(password), 'Contains a special character'],
                      ].map(([ok, label]) => (
                        <div key={label as string} className={cn('flex items-center gap-1.5', ok ? 'text-primary' : 'text-muted-foreground')}>
                          <Check className={cn('w-3 h-3', ok ? 'opacity-100' : 'opacity-50')} />
                          {label as string}
                        </div>
                      ))}
                    </div>
                  )}
                  {fieldErrors.password && <p className="mt-2 text-sm text-destructive">{fieldErrors.password}</p>}
                </div>

                {/* Email verification reminder if not yet verified */}
                {emailVerifyStep === 'idle' && emailValidation.isValid && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-400">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    Please verify your email address by clicking <strong>Send OTP</strong> above.
                  </div>
                )}

                {formError && <p className="text-sm text-destructive">{formError}</p>}

                {/* Activation success banner */}
                {submitSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-3 text-sm text-primary"
                  >
                    <Mail className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{submitSuccess}</span>
                  </motion.div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full neon-border"
                  disabled={isSubmitting || emailVerifyStep !== 'verified'}
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Creating account...
                    </span>
                  ) : emailVerifyStep !== 'verified' ? (
                    <span className="inline-flex items-center gap-2 opacity-60">
                      <ShieldCheck className="h-4 w-4" />
                      Verify Email to Continue
                    </span>
                  ) : (
                    'Sign Up'
                  )}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground mt-6 text-center">
                Already have an account?{' '}
                <Link to="/signin" className="text-primary hover:underline">Sign in</Link>
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
