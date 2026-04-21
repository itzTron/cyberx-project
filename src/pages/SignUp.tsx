import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff, LoaderCircle, ShieldPlus, UserPlus, Mail, KeyRound, ShieldCheck, RefreshCw } from 'lucide-react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';
import { getSupportedEmailDomains, validateSignUpEmail } from '@/lib/emailValidation';
import { AuthApiError, signInWithGitHub, signUpUser } from '@/lib/authApi';
import { OtpApiError, sendOtp, verifyOtp } from '@/lib/otpApi';
import { getSupabaseClient } from '@/lib/supabase';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

type AuthTab = 'password' | 'otp';
type OtpStep = 'email' | 'verify';

const SignUp = () => {
  const navigate = useNavigate();

  // ── Tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AuthTab>('password');

  // ── Password form ─────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  // ── OTP flow ──────────────────────────────────────────────────────────────
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

  const isOtpEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpEmail.trim().toLowerCase());

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendOtp = async () => {
    setOtpEmailError(''); setOtpSentMsg(''); setOtpError('');
    if (!isOtpEmailValid) { setOtpEmailError('Enter a valid email address.'); return; }
    setIsSendingOtp(true);
    try {
      const res = await sendOtp(otpEmail.trim().toLowerCase());
      setOtpSentMsg(res.message);
      setOtpStep('verify'); setOtp(''); setResendCooldown(60);
    } catch (error) {
      setOtpEmailError(error instanceof OtpApiError ? error.message : 'Failed to send OTP.');
    } finally { setIsSendingOtp(false); }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError(''); setOtpSentMsg(''); setIsSendingOtp(true);
    try {
      const res = await sendOtp(otpEmail.trim().toLowerCase());
      setOtpSentMsg(res.message); setOtp(''); setOtpAttemptsLeft(null); setResendCooldown(60);
    } catch (error) {
      setOtpError(error instanceof OtpApiError ? error.message : 'Failed to resend OTP.');
    } finally { setIsSendingOtp(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setOtpError('Enter the 6-digit code from your email.'); return; }
    setOtpError(''); setIsVerifyingOtp(true);
    try {
      const res = await verifyOtp(otpEmail.trim().toLowerCase(), otp);

      // Establish a real Supabase session so the rest of the app works
      if (res.supabase_token_hash) {
        const supabase = getSupabaseClient();
        const { error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: res.supabase_token_hash,
          type: 'magiclink',
        });
        if (sessionError) {
          console.warn('[OTP signup] Supabase session error:', sessionError.message);
        }
      }

      navigate(`/${res.user.username}`);
    } catch (error) {
      if (error instanceof OtpApiError) {
        setOtpError(error.message);
        if (error.attemptsRemaining !== undefined) setOtpAttemptsLeft(error.attemptsRemaining);
        if (error.code === 'MAX_ATTEMPTS_REACHED' || error.code === 'OTP_EXPIRED') {
          setOtpStep('email'); setOtp(''); setOtpAttemptsLeft(null);
        }
      } else { setOtpError('Verification failed. Please try again.'); }
    } finally { setIsVerifyingOtp(false); }
  };

  const supportedDomains = useMemo(() => getSupportedEmailDomains(), []);
  const normalizedEmailResult = useMemo(() => validateSignUpEmail(email), [email]);
  const showEmailFeedback = email.trim().length > 0;
  const showEmailError = showEmailFeedback && !normalizedEmailResult.isValid;
  const showEmailSuccess = showEmailFeedback && normalizedEmailResult.isValid && !fieldErrors.email;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitSuccess('');
    setFormError('');

    const nextFieldErrors: {
      name?: string;
      email?: string;
      password?: string;
    } = {};

    if (!name.trim()) {
      nextFieldErrors.name = 'Full name is required.';
    }

    if (!normalizedEmailResult.isValid) {
      nextFieldErrors.email = normalizedEmailResult.message;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!password) {
      nextFieldErrors.password = 'Password is required.';
    } else if (password.length < 8) {
      nextFieldErrors.password = 'Password must be at least 8 characters long.';
    } else if (!hasLetter || !hasNumber || !hasSpecialChar) {
      nextFieldErrors.password = 'Password must contain letters, numbers, and a special character.';
    }

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await signUpUser({ name, email, password });

      setSubmitSuccess(`${response.message} Registered email: ${response.user.email}`);
      setFieldErrors({});
      setName('');
      setEmail('');
      setPassword('');
      if (!response.emailConfirmationRequired) {
        navigate(`/${response.user.username}`);
      }
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
        setFormError('Unable to create account right now. Please try again in a moment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGitHubSignUp = async () => {
    setGithubError('');
    setIsGithubLoading(true);
    try {
      await signInWithGitHub();
      // OAuth redirects the browser — no further action needed here
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub sign-up failed. Please try again.';
      setGithubError(message);
      setIsGithubLoading(false);
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
                disabled={isGithubLoading || isSubmitting || isSendingOtp || isVerifyingOtp}
              >
                {isGithubLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                {isGithubLoading ? 'Redirecting to GitHub...' : 'Sign up with GitHub'}
              </Button>
              {githubError && <p className="text-sm text-destructive mt-2">{githubError}</p>}

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground font-mono tracking-widest uppercase">or sign up with</span>
                </div>
              </div>

              {/* Tab switcher */}
              <div className="flex rounded-lg border border-border bg-muted/30 p-1 mb-5 gap-1">
                <button
                  id="signup-tab-password"
                  type="button"
                  onClick={() => { setActiveTab('password'); setFormError(''); setSubmitSuccess(''); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'password' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Password
                </button>
                <button
                  id="signup-tab-otp"
                  type="button"
                  onClick={() => { setActiveTab('otp'); setOtpError(''); setOtpSentMsg(''); setOtpStep('email'); setOtp(''); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'otp' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email OTP
                </button>
              </div>

              {/* ── OTP tab ── */}
              {activeTab === 'otp' && (
                <div className="space-y-5">
                  {otpStep === 'email' && (
                    <>
                      <div>
                        <label htmlFor="signup-otp-email" className="block text-sm font-medium text-foreground mb-2">Email address</label>
                        <Input
                          id="signup-otp-email"
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
                        <p className="mt-2 text-xs text-muted-foreground">A 6-digit code will be emailed to you. Your account is created automatically on first sign-in.</p>
                      </div>
                      <Button id="signup-otp-send" type="button" size="lg" className="w-full neon-border" disabled={isSendingOtp || !otpEmail.trim()} onClick={() => void handleSendOtp()}>
                        {isSendingOtp
                          ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Sending code...</span>
                          : <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" />Send OTP</span>}
                      </Button>
                    </>
                  )}
                  {otpStep === 'verify' && (
                    <>
                      {otpSentMsg && (
                        <div className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 text-sm text-primary">
                          <Check className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>{otpSentMsg} Check <strong>{otpEmail}</strong>.</span>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-3">Enter 6-digit code</label>
                        <div className="flex justify-center">
                          <InputOTP id="signup-otp-input" maxLength={6} value={otp} onChange={(val) => { setOtp(val); setOtpError(''); }} onComplete={() => void handleVerifyOtp()}>
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
                      <Button id="signup-otp-verify" type="button" size="lg" className="w-full neon-border" disabled={isVerifyingOtp || otp.length !== 6} onClick={() => void handleVerifyOtp()}>
                        {isVerifyingOtp
                          ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Verifying...</span>
                          : <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Verify & Create Account</span>}
                      </Button>
                      <div className="flex items-center justify-between pt-1">
                        <button type="button" onClick={() => { setOtpStep('email'); setOtp(''); setOtpError(''); setOtpSentMsg(''); setOtpAttemptsLeft(null); }} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors">Change email</button>
                        <button id="signup-otp-resend" type="button" disabled={resendCooldown > 0 || isSendingOtp} onClick={() => void handleResendOtp()}
                          className={cn('inline-flex items-center gap-1.5 text-xs transition-colors', resendCooldown > 0 || isSendingOtp ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:underline underline-offset-2 cursor-pointer')}>
                          <RefreshCw className={cn('h-3 w-3', isSendingOtp && 'animate-spin')} />
                          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Password tab ── */}
              {activeTab === 'password' && <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div>
                  <label htmlFor="signup-name" className="block text-sm font-medium text-foreground mb-2">
                    Full name
                  </label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setFieldErrors((current) => ({ ...current, name: undefined }));
                    }}
                    placeholder="Your full name"
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    className={cn(
                      'bg-muted/50 border-border',
                      fieldErrors.name && 'border-destructive focus-visible:ring-destructive/40',
                    )}
                  />
                  {fieldErrors.name && <p className="mt-2 text-sm text-destructive">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setFieldErrors((current) => ({ ...current, email: undefined }));
                      }}
                      placeholder="you@gmail.com"
                      autoComplete="email"
                      aria-invalid={Boolean(fieldErrors.email) || showEmailError}
                      className={cn(
                        'bg-muted/50 border-border pr-10',
                        (fieldErrors.email || showEmailError) && 'border-destructive focus-visible:ring-destructive/40',
                        showEmailSuccess && 'border-primary focus-visible:ring-primary/40',
                      )}
                    />
                    {showEmailSuccess && (
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-primary">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  {fieldErrors.email && <p className="mt-2 text-sm text-destructive">{fieldErrors.email}</p>}
                  {!fieldErrors.email && showEmailError && (
                    <p className="mt-2 text-sm text-destructive">{normalizedEmailResult.message}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Supported domains: {supportedDomains.join(', ')}.
                  </p>
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-sm font-medium text-foreground mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFieldErrors((current) => ({ ...current, password: undefined }));
                      }}
                      placeholder="Create a password"
                      autoComplete="new-password"
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
                  {password.length > 0 && (
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className={cn("flex items-center gap-1.5", password.length >= 8 ? "text-primary" : "text-muted-foreground")}>
                        <Check className={cn("w-3 h-3", password.length >= 8 ? "opacity-100" : "opacity-50")} />
                        At least 8 characters
                      </div>
                      <div className={cn("flex items-center gap-1.5", /[a-zA-Z]/.test(password) ? "text-primary" : "text-muted-foreground")}>
                        <Check className={cn("w-3 h-3", /[a-zA-Z]/.test(password) ? "opacity-100" : "opacity-50")} />
                        Contains a letter
                      </div>
                      <div className={cn("flex items-center gap-1.5", /\d/.test(password) ? "text-primary" : "text-muted-foreground")}>
                        <Check className={cn("w-3 h-3", /\d/.test(password) ? "opacity-100" : "opacity-50")} />
                        Contains a number
                      </div>
                      <div className={cn("flex items-center gap-1.5", /[!@#$%^&*(),.?":{}|<>]/.test(password) ? "text-primary" : "text-muted-foreground")}>
                        <Check className={cn("w-3 h-3", /[!@#$%^&*(),.?":{}|<>]/.test(password) ? "opacity-100" : "opacity-50")} />
                        Contains a special character
                      </div>
                    </div>
                  )}
                  {fieldErrors.password && <p className="mt-2 text-sm text-destructive">{fieldErrors.password}</p>}
                </div>

                {formError && <p className="text-sm text-destructive">{formError}</p>}
                {submitSuccess && <p className="text-sm text-primary">{submitSuccess}</p>}

                <Button type="submit" size="lg" className="w-full neon-border" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Creating account...
                    </span>
                  ) : (
                    'Sign Up'
                  )}
                </Button>
              </form>}

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
