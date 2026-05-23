import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/apiBaseUrl';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

type Step = 'loading' | 'form' | 'pending' | 'error';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('loading');
  const [sessionError, setSessionError] = useState('');
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // On mount — verify Supabase recovery session from URL hash
  useEffect(() => {
    const supabase = getSupabaseClient();

    const handleRecovery = async () => {
      // Supabase recovery links redirect with #access_token or via PKCE
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        // Try verifyOtp with token_hash from URL params (Supabase v2 PKCE flow)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const searchParams = new URLSearchParams(window.location.search);
        const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash') || '';
        const type = searchParams.get('type') || hashParams.get('type') || 'recovery';

        if (tokenHash) {
          const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (verifyErr || !verifyData?.session) {
            setSessionError('This recovery link is invalid or has expired. Please request a new one.');
            setStep('error');
            return;
          }
          setUserId(verifyData.session.user.id);
          setUserEmail(verifyData.session.user.email || '');
          setStep('form');
          return;
        }

        setSessionError('No valid recovery session found. Please request a new reset link.');
        setStep('error');
        return;
      }

      if (session.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || '');
        setStep('form');
      } else {
        setSessionError('Could not verify your identity. Please request a new reset link.');
        setStep('error');
      }
    };

    void handleRecovery();
  }, []);

  const passwordStrength = (() => {
    if (!password) return { level: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { level: score, label: 'Weak', color: 'text-red-400' };
    if (score <= 3) return { level: score, label: 'Fair', color: 'text-yellow-400' };
    return { level: score, label: 'Strong', color: 'text-green-400' };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 8) { setFormError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setFormError('Passwords do not match.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any)?.error || 'Failed to process reset. Please try again.');
      setStep('pending');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoaderCircle className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <GlassCard className="p-8 max-w-md w-full text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Link Expired</h1>
            <p className="text-sm text-muted-foreground">{sessionError}</p>
            <Button asChild className="w-full neon-border">
              <Link to="/forgot-password">Request New Link</Link>
            </Button>
          </GlassCard>
        </div>
        <Footer />
      </div>
    );
  }

  if (step === 'pending') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
            <GlassCard className="p-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Almost there!</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A confirmation email has been sent to <strong className="text-primary">{userEmail}</strong>.
              </p>
              <div className="rounded-lg bg-muted/30 border border-border p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">What happens next</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">1.</span>Open the email from Cyberspace-X</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">2.</span>Click <strong>"Yes, this was me"</strong> to confirm</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">3.</span>Your new password will be active within <strong>5 minutes</strong></li>
                  <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✕</span>If it wasn't you, click <strong>"Not me"</strong> to cancel</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">The links in the email expire in 1 hour.</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/signin">Back to Sign In</Link>
              </Button>
            </GlassCard>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <GlassCard className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <LockKeyhole className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
              {userEmail && (
                <p className="mt-1 text-sm text-muted-foreground">
                  For <span className="text-primary">{userEmail}</span>
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* New password */}
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-foreground mb-2">New Password</label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFormError(''); }}
                    placeholder="At least 8 characters"
                    className="bg-muted/50 border-border pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Strength bar */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= passwordStrength.level
                            ? passwordStrength.level <= 1 ? 'bg-red-400' : passwordStrength.level <= 3 ? 'bg-yellow-400' : 'bg-green-400'
                            : 'bg-muted'
                        }`} />
                      ))}
                    </div>
                    <p className={`text-xs ${passwordStrength.color}`}>{passwordStrength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="reset-confirm" className="block text-sm font-medium text-foreground mb-2">Confirm Password</label>
                <div className="relative">
                  <Input
                    id="reset-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setFormError(''); }}
                    placeholder="Repeat your new password"
                    className={`bg-muted/50 border-border pr-10 ${
                      confirmPassword && password !== confirmPassword ? 'border-destructive' : ''
                    }`}
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-destructive">Passwords don't match</p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="mt-1 text-xs text-green-400 flex items-center gap-1"><Check className="h-3 w-3" />Passwords match</p>
                )}
              </div>

              {formError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {formError}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full neon-border" disabled={isSubmitting}>
                {isSubmitting
                  ? <><LoaderCircle className="h-4 w-4 animate-spin mr-2" />Saving…</>
                  : 'Set New Password'}
              </Button>
            </form>
          </GlassCard>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
