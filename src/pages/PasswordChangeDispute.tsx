import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';

/**
 * /password-change-dispute
 *
 * Shown after the user clicks "Not me — Cancel" in the confirmation email.
 * The server has already cancelled the pending change (status → 'disputed')
 * and sent a security alert email with a new recovery link.
 *
 * Query params:
 *   ?status=cancelled           → success
 *   ?error=invalid_token | already_used | missing_token | server_error
 */

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'This dispute link is invalid or has already been used.',
  already_used: 'This link was already used. Your password change may have already been cancelled.',
  missing_token: 'The dispute link is incomplete. Please use the exact link from your email.',
  server_error: 'A server error occurred while processing your request. Please contact support.',
};

const PasswordChangeDispute = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const error = searchParams.get('error');
  const isSuccess = status === 'cancelled';

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
                <ShieldCheck className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Change Cancelled</h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  The password change has been <strong className="text-green-400">cancelled</strong>. Your previous password remains active.
                </p>
              </div>

              <div className="rounded-lg bg-muted/30 border border-border p-4 text-left space-y-3">
                <p className="text-sm font-semibold text-foreground">What we've done:</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    The unauthorized password change has been blocked
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    A security alert has been sent to your primary email
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">→</span>
                    A new recovery link was included in that email — use it to set a new password if needed
                  </li>
                </ul>
              </div>

              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-400">
                <strong>Security tip:</strong> If someone tried to change your password without your knowledge, consider also reviewing your active sessions and enabling stronger authentication methods.
              </div>

              <div className="flex flex-col gap-2">
                <Button asChild className="w-full neon-border">
                  <Link to="/forgot-password">Set a New Password</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/signin">Back to Sign In</Link>
                </Button>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                {error === 'already_used' ? 'Already Processed' : 'Invalid Link'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {error ? (ERROR_MESSAGES[error] || 'Something went wrong.') : 'No status information was found.'}
              </p>
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

export default PasswordChangeDispute;
