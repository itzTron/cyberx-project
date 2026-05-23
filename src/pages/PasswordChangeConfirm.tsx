import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Clock, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

/**
 * /password-change-confirm
 *
 * The server redirects here after the user clicks "Yes, this was me" in the email.
 * The server has already updated the record status → 'confirmed' and set applies_at = now + 5 min.
 *
 * Query params set by the server:
 *   ?status=confirmed           → success
 *   ?error=invalid_token
 *   ?error=already_used
 *   ?error=expired
 *   ?error=missing_token
 *   ?error=server_error
 */

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'This confirmation link is invalid. It may have already been used or does not exist.',
  already_used: 'This link has already been used. Your password change status is unchanged.',
  expired: 'This confirmation link has expired. Please start a new password reset.',
  missing_token: 'The confirmation link is incomplete. Please use the link from your email.',
  server_error: 'A server error occurred. Please try again or contact support.',
};

const PasswordChangeConfirm = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const error = searchParams.get('error');

  // Countdown timer for "5 minutes"
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);
  const isSuccess = status === 'confirmed';

  useEffect(() => {
    if (!isSuccess) return;
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [isSuccess, secondsLeft]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const errorMessage = error ? (ERROR_MESSAGES[error] || 'Something went wrong.') : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {isSuccess ? (
            <GlassCard className="p-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20">
                <Check className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Password Change Confirmed</h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  You've confirmed this password change. Your new password will be activated in approximately:
                </p>
              </div>
              {/* Countdown */}
              <div className="flex items-center justify-center gap-3 py-3 px-6 rounded-xl bg-primary/10 border border-primary/20">
                <Clock className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-3xl font-mono font-bold text-primary">
                  {secondsLeft > 0 ? formatTime(secondsLeft) : '✅ Applied'}
                </span>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-4 text-left text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground text-sm">What happens now:</p>
                <p>• Your old password stays active until the countdown reaches zero</p>
                <p>• After 5 minutes, the new password is applied automatically</p>
                <p>• You'll receive a final confirmation email once it's done</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link to="/signin">Go to Sign In</Link>
              </Button>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                {error === 'expired' ? 'Link Expired' : error === 'already_used' ? 'Link Already Used' : 'Invalid Link'}
              </h1>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full neon-border">
                  <Link to="/forgot-password">Start New Reset</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/signin">Back to Sign In</Link>
                </Button>
              </div>
            </GlassCard>
          )}
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default PasswordChangeConfirm;
