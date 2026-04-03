import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Clock3, LayoutDashboard, LogOut, Menu, Repeat, User, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getCurrentUserProfile, signOutDashboardUser, type HubUserProfile } from '@/lib/hubApi';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/tools', label: 'Tools' },
  { href: '/dashboard', label: 'Hub' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/download', label: 'Download' },
  { href: '/docs', label: 'Docs' },
  { href: '/contact', label: 'Contact' },
];

const reservedTopLevelRoutes = new Set([
  'features',
  'tools',
  'dashboard',
  'profile',
  'activity',
  'roadmap',
  'download',
  'docs',
  'contact',
  'signin',
  'signup',
]);

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<HubUserProfile | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const topLevelSegments = useMemo(() => location.pathname.split('/').filter(Boolean), [location.pathname]);
  const singleTopLevelSegment = topLevelSegments.length === 1 ? topLevelSegments[0] : '';
  const isUsernameRoute = Boolean(singleTopLevelSegment && !reservedTopLevelRoutes.has(singleTopLevelSegment));

  const isLinkActive = useCallback(
    (href: string) => {
      if (href === '/tools') {
        return location.pathname === '/tools' || location.pathname.startsWith('/tools/');
      }

      if (href === '/dashboard') {
        return location.pathname === '/dashboard' || location.pathname === '/profile' || location.pathname === '/activity' || isUsernameRoute;
      }

      return location.pathname === href;
    },
    [isUsernameRoute, location.pathname],
  );

  const loadCurrentUser = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCurrentUser(null);
      setIsAuthReady(true);
      return;
    }

    try {
      const profile = await getCurrentUserProfile();
      setCurrentUser(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('sign in')) {
        setCurrentUser(null);
      } else {
        console.error('Unable to load auth user in navbar:', error);
        setCurrentUser(null);
      }
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();

    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadCurrentUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadCurrentUser]);

  const handleSignOut = useCallback(
    async (targetPath: '/signin' | '/signup') => {
      if (isSigningOut) {
        return;
      }

      setIsSigningOut(true);
      try {
        await signOutDashboardUser();
      } catch (error) {
        console.error('Unable to sign out:', error);
      } finally {
        setCurrentUser(null);
        setIsOpen(false);
        setIsSigningOut(false);
        navigate(targetPath);
      }
    },
    [isSigningOut, navigate],
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 rounded-t-none border-x-0">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img 
              src="/cyberx.png" 
              alt="CyberX Logo" 
              className="h-20 w-auto transition-all duration-300 group-hover:drop-shadow-[0_0_10px_hsl(135,100%,45%)]" 
            />
            <span className="text-xl font-bold font-mono text-foreground group-hover:text-primary transition-colors">
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isLinkActive(link.href)
                    ? 'text-primary bg-primary/10 neon-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-2">
            {!isAuthReady ? (
              <div className="h-9 w-24" />
            ) : currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left hover:border-primary/50 hover:bg-muted/40 transition-colors"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={currentUser.avatarUrl || undefined} alt={currentUser.fullName} />
                      <AvatarFallback>{getInitials(currentUser.fullName || currentUser.username)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden lg:block text-sm text-foreground max-w-[140px] truncate">{currentUser.fullName}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <div className="px-2 py-2">
                    <p className="text-xs text-muted-foreground">Signed in as</p>
                    <div className="mt-2 flex items-start gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={currentUser.avatarUrl || undefined} alt={currentUser.fullName} />
                        <AvatarFallback>{getInitials(currentUser.fullName || currentUser.username)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{currentUser.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">@{currentUser.username}</p>
                      </div>
                    </div>
                    {currentUser.bio && (
                      <p className="text-xs text-muted-foreground mt-2 overflow-hidden text-ellipsis whitespace-nowrap">
                        {currentUser.bio}
                      </p>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/${currentUser.username}`} className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Your Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/activity" className="cursor-pointer">
                      <Clock3 className="mr-2 h-4 w-4" />
                      Latest Activity
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={isSigningOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleSignOut('/signin');
                    }}
                  >
                    <Repeat className="mr-2 h-4 w-4" />
                    Switch Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isSigningOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleSignOut('/signup');
                    }}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create New Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isSigningOut}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleSignOut('/signin');
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link to="/signin">Sign In</Link>
                </Button>
                <Button asChild variant="default" className="neon-border">
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-foreground hover:text-primary transition-colors"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass-panel border-t-0 rounded-t-none"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isLinkActive(link.href)
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {!isAuthReady ? null : currentUser ? (
                <div className="mt-2 rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={currentUser.avatarUrl || undefined} alt={currentUser.fullName} />
                      <AvatarFallback>{getInitials(currentUser.fullName || currentUser.username)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{currentUser.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">@{currentUser.username}</p>
                    </div>
                  </div>
                  {currentUser.bio && (
                    <p className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                      {currentUser.bio}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    <Button asChild variant="outline">
                      <Link to={`/${currentUser.username}`} onClick={() => setIsOpen(false)}>
                        Your Profile
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/profile" onClick={() => setIsOpen(false)}>
                        Profile Settings
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/activity" onClick={() => setIsOpen(false)}>
                        Latest Activity
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSigningOut}
                      onClick={() => void handleSignOut('/signin')}
                    >
                      Switch Account
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      className="neon-border"
                      disabled={isSigningOut}
                      onClick={() => void handleSignOut('/signup')}
                    >
                      Create New Account
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline">
                    <Link to="/signin" onClick={() => setIsOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                  <Button asChild variant="default" className="neon-border">
                    <Link to="/signup" onClick={() => setIsOpen(false)}>
                      Sign Up
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
