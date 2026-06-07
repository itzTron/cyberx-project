import { motion } from 'framer-motion';
import { AlertTriangle, Check, Mail, ShieldOff, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import Footer from '@/components/Footer';
import GlassCard from '@/components/GlassCard';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: 'This confirmation link is invalid. It may have already been used or replaced by a newer request.',
  expired: 'This confirmation link has expired. Start the action again from your profile settings if you still want to continue.',
  missing_token: 'The confirmation link is incomplete. Use the link from the email sent to your primary address.',
  server_error: 'We could not complete this request right now. Please try again later or contact support if the issue continues.',
};

const AccountActionConfirm = () => {
  const [searchParams] = useSearchParams();
  const action = (searchParams.get('action') || '').trim();
  const status = (searchParams.get('status') || '').trim();
  const error = (searchParams.get('error') || '').trim();

  const isDelete = action === 'delete';
  const isSuccess = status === 'completed';
  const errorMessage = error ? (ERROR_MESSAGES[error] || 'Something went wrong while confirming this request.') : '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {isSuccess ? (
            <GlassCard className="p-8 text-center space-y-6">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full border ${isDelete ? 'bg-destructive/10 border-destructive/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                {isDelete ? <Trash2 className="h-8 w-8 text-destructive" /> : <ShieldOff className="h-8 w-8 text-amber-300" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {isDelete ? 'Account Deleted' : 'Account Disabled'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {isDelete
                    ? 'Your confirmation was accepted and your Cyberspace-X account has been permanently removed.'
                    : 'Your confirmation was accepted and your Cyberspace-X account is now disabled until you reactivate it.'}
                </p>
              </div>
              <div className={`flex items-center justify-center gap-3 py-3 px-6 rounded-xl border ${isDelete ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                <Check className="h-5 w-5" />
                <span className="text-lg font-semibold">
                  {isDelete ? 'Deletion completed' : 'Disable completed'}
                </span>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border p-4 text-left text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground text-sm">What happens now:</p>
                <p>{isDelete ? 'Your primary email can be used again for a fresh signup.' : 'You can request a reactivation link from the sign-in page whenever you want access again.'}</p>
                <p>{isDelete ? 'Any remaining local session should be treated as inactive.' : 'If you leave the account disabled for 60 days, it will be permanently removed.'}</p>
              </div>
              <Button asChild className="w-full neon-border">
                <Link to={isDelete ? '/signup' : '/signin'}>
                  {isDelete ? 'Go to Sign Up' : 'Go to Sign In'}
                </Link>
              </Button>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground">
                {error === 'expired' ? 'Link Expired' : 'Confirmation Failed'}
              </h1>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full neon-border">
                  <Link to="/profile">
                    <Mail className="h-4 w-4 mr-2" />
                    Back to Profile
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to={isDelete ? '/signup' : '/signin'}>
                    {isDelete ? 'Go to Sign Up' : 'Go to Sign In'}
                  </Link>
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

export default AccountActionConfirm;
