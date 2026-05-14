import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  getNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead,
  type HubNotification,
} from '@/lib/hubApi';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const getInitials = (name: string) =>
  name.split(' ').map((p) => p.trim()[0] || '').join('').slice(0, 2).toUpperCase() || '?';

const getNotificationMessage = (notification: HubNotification) => {
  const username = notification.fromProfile?.username;
  if (!username) return notification.message;

  const prefixedMessage = `@${username} `;
  return notification.message.startsWith(prefixedMessage)
    ? notification.message.slice(prefixedMessage.length)
    : notification.message;
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<HubNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Poll unread count
  const pollCount = useCallback(async () => {
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch { /* unauthenticated or table missing */ }
  }, []);

  const loadNotifications = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const data = await getNotifications();
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    } catch {
      // unauthenticated or table missing
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void pollCount();
    const timer = setInterval(() => void pollCount(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pollCount]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    }).catch(() => {
      setUserId(null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);

      if (!nextUserId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      void pollCount();
      if (isOpenRef.current) {
        void loadNotifications();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadNotifications, pollCount]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) {
      return;
    }

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void pollCount();
          if (isOpenRef.current) {
            void loadNotifications();
          }
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          return;
        }

        void pollCount();
        if (isOpenRef.current) {
          void loadNotifications();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, pollCount, userId]);

  // Load full list when panel opens
  useEffect(() => {
    if (!isOpen) return;
    void loadNotifications(true);
  }, [isOpen, loadNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleClickNotification = async (n: HubNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id).catch(() => {});
      setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, read: true } : item));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    setIsOpen(false);
    if (n.fromProfile?.username) navigate(`/u/${n.fromProfile.username}`);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-h-[420px] overflow-hidden rounded-xl border border-border bg-background/95 backdrop-blur-lg shadow-2xl shadow-black/40 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button type="button" onClick={() => void handleMarkAllRead()}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded">
                    <Check className="w-3 h-3" />Mark all read
                  </button>
                )}
                <button type="button" onClick={() => setIsOpen(false)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button key={n.id} type="button" onClick={() => void handleClickNotification(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 ${!n.read ? 'bg-primary/5' : ''}`}>
                    {n.fromProfile ? (
                      <Avatar className="w-8 h-8 shrink-0 border border-primary/20">
                        <AvatarImage src={n.fromProfile.avatarUrl} alt={n.fromProfile.fullName} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {getInitials(n.fromProfile.fullName || n.fromProfile.username)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserPlus className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug">
                        {n.fromProfile ? (
                          <><span className="font-semibold text-primary">@{n.fromProfile.username}</span>{' '}</>
                        ) : null}
                        {getNotificationMessage(n)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
