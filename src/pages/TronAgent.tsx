import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Flag,
  FolderGit2,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';

import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { getDashboardBootstrap, listPushableRepositories, type DashboardBootstrap, type HubRepository } from '@/lib/hubApi';
import { runRepositoryAgent, type RepoAgentMemory, type RepoAgentResult, type RepoAgentAction } from '@/lib/repoAgent';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type MessageRole = 'tron' | 'user' | 'system';

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  steps?: string[];
  isLoading?: boolean;
  isWelcome?: boolean;
  timestamp: Date;
  pendingAction?: RepoAgentAction;
};

type StoredChatMessage = Omit<ChatMessage, 'timestamp' | 'isLoading'> & {
  timestamp: string;
};

type ChatThread = {
  id: string;
  title: string;
  repoId: string;
  repoName: string;
  memory: RepoAgentMemory;
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type ChatReportRecord = {
  id: string;
  threadId: string;
  messageId: string;
  repoId: string;
  repoName: string;
  content: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const MAX_CHAT_THREADS = 30;
const MAX_MESSAGES_PER_THREAD = 220;
const MAX_REPORT_RECORDS = 300;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((p) => p.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const makeMessage = (role: MessageRole, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: generateId(),
  role,
  content,
  timestamp: new Date(),
  ...extra,
});

const getChatHistoryStorageKey = (userId: string) => `tron_chat_history_${userId}`;
const getChatReportsStorageKey = (userId: string) => `tron_chat_reports_${userId}`;

const truncate = (value: string, max = 56) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}...`;
};

const formatThreadUpdatedAt = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const deriveThreadTitle = (messages: ChatMessage[]) => {
  const firstUserPrompt = messages.find((msg) => msg.role === 'user' && msg.content.trim());
  if (firstUserPrompt) return truncate(firstUserPrompt.content, 50);
  return 'New conversation';
};

const makeWelcomeMessage = (firstName: string) =>
  makeMessage(
    'tron',
    `Hi, welcome ${firstName}!\n\nI'm Tron, your CyberX Assistant Agent. I can help you explore, analyze, and manage your repositories.\n\nSelect a repository below and ask me anything: list files, search code, view commit history, or create new commits.`,
    { isWelcome: true },
  );

const serializeMessages = (messages: ChatMessage[]): StoredChatMessage[] =>
  messages
    .filter((msg) => !msg.isLoading)
    .slice(-MAX_MESSAGES_PER_THREAD)
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      steps: msg.steps,
      isWelcome: msg.isWelcome,
      pendingAction: msg.pendingAction,
      timestamp: msg.timestamp.toISOString(),
    }));

const deserializeMessages = (messages: StoredChatMessage[]): ChatMessage[] =>
  messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    steps: msg.steps,
    isWelcome: msg.isWelcome,
    pendingAction: msg.pendingAction,
    timestamp: new Date(msg.timestamp),
  }));

const createThread = ({
  firstName,
  repoId,
  repoName,
  includeWelcome,
}: {
  firstName: string;
  repoId: string;
  repoName: string;
  includeWelcome: boolean;
}): { thread: ChatThread; messages: ChatMessage[] } => {
  const now = new Date().toISOString();
  const messages = includeWelcome ? [makeWelcomeMessage(firstName)] : [];
  return {
    messages,
    thread: {
      id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: 'New conversation',
      repoId,
      repoName,
      memory: {
        currentRepoId: repoId,
        recentFiles: [],
      },
      messages: serializeMessages(messages),
      createdAt: now,
      updatedAt: now,
    },
  };
};

/* ------------------------------------------------------------------ */
/*  Animated dots for loading                                           */
/* ------------------------------------------------------------------ */

const TypingDots = () => (
  <span className="tron-typing-dots">
    <span />
    <span />
    <span />
  </span>
);

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

const TronAgent = () => {
  const { toast } = useToast();

  /* Auth / data state */
  const [user, setUser] = useState<DashboardBootstrap['user'] | null>(null);
  const [repositories, setRepositories] = useState<HubRepository[]>([]);
  const [pushableRepoIds, setPushableRepoIds] = useState<Set<string>>(new Set());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');

  /* Repo selector */
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);

  /* Chat state */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [agentMemory, setAgentMemory] = useState<RepoAgentMemory>({ currentRepoId: '', recentFiles: [] });
  const [isThinking, setIsThinking] = useState(false);

  /* Conversation history */
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);

  /* Refs */
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const agentAbortControllerRef = useRef<AbortController | null>(null);

  /* ---- Bootstrap ---- */
  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const data = await getDashboardBootstrap();
        setUser(data.user);
        setRepositories(data.repositories);

        const pushable = await listPushableRepositories();
        setPushableRepoIds(new Set(pushable.map((r) => r.id)));

        const firstName = (data.user.fullName || data.user.username || 'there').split(' ')[0];
        const historyStorageKey = getChatHistoryStorageKey(data.user.id);
        const reportsStorageKey = getChatReportsStorageKey(data.user.id);

        let hydratedThreads: ChatThread[] = [];
        let hydratedActiveId = '';

        try {
          const rawHistory = localStorage.getItem(historyStorageKey);
          if (rawHistory) {
            const parsed = JSON.parse(rawHistory) as { threads?: ChatThread[]; activeThreadId?: string };
            if (Array.isArray(parsed.threads)) {
              hydratedThreads = parsed.threads
                .filter((thread) => Array.isArray(thread.messages) && typeof thread.id === 'string')
                .slice(0, MAX_CHAT_THREADS);
              hydratedActiveId = parsed.activeThreadId || '';
            }
          }
        } catch {
          hydratedThreads = [];
          hydratedActiveId = '';
        }

        if (hydratedThreads.length === 0) {
          const initialRepo = data.repositories[0];
          const { thread, messages: initialMessages } = createThread({
            firstName,
            repoId: initialRepo?.id || '',
            repoName: initialRepo?.name || '',
            includeWelcome: true,
          });

          setMessages(initialMessages);
          setAgentMemory(thread.memory);
          setSelectedRepoId(thread.repoId);
          setChatThreads([thread]);
          setActiveThreadId(thread.id);
        } else {
          const fallbackThread = hydratedThreads[0];
          const activeThread = hydratedThreads.find((thread) => thread.id === hydratedActiveId) || fallbackThread;

          const repoExists = data.repositories.some((repo) => repo.id === activeThread.repoId);
          setSelectedRepoId(repoExists ? activeThread.repoId : data.repositories[0]?.id || '');
          setMessages(deserializeMessages(activeThread.messages));
          setAgentMemory(activeThread.memory || { currentRepoId: activeThread.repoId || '', recentFiles: [] });
          setChatThreads(hydratedThreads);
          setActiveThreadId(activeThread.id);
        }

        try {
          const rawReports = localStorage.getItem(reportsStorageKey);
          if (rawReports) {
            const parsed = JSON.parse(rawReports) as ChatReportRecord[];
            if (Array.isArray(parsed)) {
              setReportedMessageIds(new Set(parsed.map((report) => report.messageId)));
            }
          }
        } catch {
          setReportedMessageIds(new Set());
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unable to load session.';
        setBootstrapError(msg);
      } finally {
        setIsBootstrapping(false);
      }
    };
    void bootstrap();
  }, []);

  /* Persist active thread with current chat content */
  useEffect(() => {
    if (!activeThreadId) return;

    const title = deriveThreadTitle(messages);
    const selectedRepo = repositories.find((repo) => repo.id === selectedRepoId) || null;
    const repoName = selectedRepo?.name || '';

    setChatThreads((previous) => {
      const exists = previous.some((thread) => thread.id === activeThreadId);
      if (!exists) return previous;

      const updated = previous.map((thread) => {
        if (thread.id !== activeThreadId) return thread;
        return {
          ...thread,
          title,
          repoId: selectedRepoId || thread.repoId,
          repoName: repoName || thread.repoName,
          memory: {
            currentRepoId: selectedRepoId || agentMemory.currentRepoId || thread.memory.currentRepoId,
            recentFiles: [...(agentMemory.recentFiles || [])],
          },
          messages: serializeMessages(messages),
          updatedAt: new Date().toISOString(),
        };
      });

      return updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  }, [activeThreadId, agentMemory, messages, repositories, selectedRepoId]);

  /* Persist thread list to localStorage */
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(
        getChatHistoryStorageKey(user.id),
        JSON.stringify({
          threads: chatThreads.slice(0, MAX_CHAT_THREADS),
          activeThreadId,
        }),
      );
    } catch {
      // Ignore storage quota/runtime errors.
    }
  }, [activeThreadId, chatThreads, user]);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Close repo dropdown on outside click */
  useEffect(() => {
    const handler = () => setRepoDropdownOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(
    () => () => {
      agentAbortControllerRef.current?.abort(new Error('AI request was cancelled.'));
    },
    [],
  );

  useEffect(() => {
    if (!copiedMessageId) return;
    const timer = window.setTimeout(() => setCopiedMessageId(''), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedMessageId]);

  /* ---- Helpers ---- */
  const selectedRepo = repositories.find((r) => r.id === selectedRepoId) ?? null;

  const appendMessage = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);

  const updateMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const activateThread = (thread: ChatThread) => {
    const repoExists = repositories.some((repo) => repo.id === thread.repoId);
    setActiveThreadId(thread.id);
    setSelectedRepoId(repoExists ? thread.repoId : repositories[0]?.id || '');
    setMessages(deserializeMessages(thread.messages));
    setAgentMemory(thread.memory || { currentRepoId: thread.repoId || '', recentFiles: [] });
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleNewConversation = () => {
    if (!user) return;

    const firstName = (user.fullName || user.username || 'there').split(' ')[0];
    const selected = repositories.find((repo) => repo.id === selectedRepoId) || repositories[0];

    const { thread, messages: initialMessages } = createThread({
      firstName,
      repoId: selected?.id || '',
      repoName: selected?.name || '',
      includeWelcome: false,
    });

    setChatThreads((prev) => [thread, ...prev].slice(0, MAX_CHAT_THREADS));
    setActiveThreadId(thread.id);
    setMessages(initialMessages);
    setAgentMemory({ currentRepoId: thread.repoId, recentFiles: [] });
    setInputValue('');
    setHistoryPanelOpen(false);
  };

  const handleSelectThread = (threadId: string) => {
    const thread = chatThreads.find((item) => item.id === threadId);
    if (!thread) return;
    activateThread(thread);
    setHistoryPanelOpen(false);
  };

  const handleDeleteConversation = (threadId: string) => {
    if (!user) return;
    const targetThread = chatThreads.find((thread) => thread.id === threadId);
    if (!targetThread) return;

    const confirmed = window.confirm('Delete this conversation permanently from your chat history?');
    if (!confirmed) return;

    const remainingThreads = chatThreads.filter((thread) => thread.id !== threadId);

    try {
      const reportsStorageKey = getChatReportsStorageKey(user.id);
      const rawReports = localStorage.getItem(reportsStorageKey);
      if (rawReports) {
        const reports = JSON.parse(rawReports) as ChatReportRecord[];
        if (Array.isArray(reports)) {
          const filtered = reports.filter((report) => report.threadId !== threadId);
          localStorage.setItem(reportsStorageKey, JSON.stringify(filtered));
          setReportedMessageIds(new Set(filtered.map((report) => report.messageId)));
        }
      }
    } catch {
      // ignore storage errors
    }

    if (remainingThreads.length === 0) {
      const firstName = (user.fullName || user.username || 'there').split(' ')[0];
      const selected = repositories.find((repo) => repo.id === selectedRepoId) || repositories[0];
      const { thread, messages: initialMessages } = createThread({
        firstName,
        repoId: selected?.id || '',
        repoName: selected?.name || '',
        includeWelcome: false,
      });

      setChatThreads([thread]);
      setActiveThreadId(thread.id);
      setMessages(initialMessages);
      setAgentMemory(thread.memory);
      setInputValue('');
    } else {
      setChatThreads(remainingThreads);
      if (activeThreadId === threadId) {
        activateThread(remainingThreads[0]);
      }
    }

    toast({
      title: 'Conversation deleted',
      description: `"${targetThread.title || 'Conversation'}" has been removed from history.`,
    });
  };

  const copyToClipboard = async (text: string) => {
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    await copyToClipboard(msg.content);
    setCopiedMessageId(msg.id);
    toast({
      title: 'Copied',
      description: 'Assistant response copied to clipboard.',
    });
  };

  const handleReportMessage = (msg: ChatMessage) => {
    if (!user || reportedMessageIds.has(msg.id) || !activeThreadId) return;

    const report: ChatReportRecord = {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId: activeThreadId,
      messageId: msg.id,
      repoId: selectedRepoId,
      repoName: selectedRepo?.name || '',
      content: msg.content,
      createdAt: new Date().toISOString(),
    };

    const nextIds = new Set(reportedMessageIds);
    nextIds.add(msg.id);
    setReportedMessageIds(nextIds);

    try {
      const storageKey = getChatReportsStorageKey(user.id);
      const raw = localStorage.getItem(storageKey);
      const existing = raw ? (JSON.parse(raw) as ChatReportRecord[]) : [];
      const next = [report, ...(Array.isArray(existing) ? existing : [])].slice(0, MAX_REPORT_RECORDS);
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }

    toast({
      title: 'Reported',
      description: 'This response has been flagged for review.',
    });
  };

  /* ---- Send handler ---- */
  const handleSend = async (overrideInput?: string, forcedAction?: RepoAgentAction) => {
    const text = (overrideInput ?? inputValue).trim();
    if (!text && !forcedAction) return;
    if (!selectedRepoId || !selectedRepo) {
      appendMessage(makeMessage('system', 'Please select a repository first.'));
      return;
    }

    if (!forcedAction && text) {
      appendMessage(makeMessage('user', text));
      setInputValue('');
    }

    agentAbortControllerRef.current?.abort(new Error('Previous AI request was cancelled.'));
    const requestController = new AbortController();
    agentAbortControllerRef.current = requestController;

    const loadingId = generateId();
    appendMessage(makeMessage('tron', '', { id: loadingId, isLoading: true }));
    setIsThinking(true);

    try {
      const result: RepoAgentResult = await runRepositoryAgent({
        userInput: text || forcedAction?.userInput || '',
        repoId: selectedRepoId,
        repositories,
        pushableRepoIds,
        memory: agentMemory,
        forcedAction,
        signal: requestController.signal,
      });

      setAgentMemory(result.memory);

      if (result.kind === 'confirmation_required') {
        updateMessage(loadingId, {
          isLoading: false,
          content: result.response,
          steps: result.steps,
          pendingAction: result.action,
        });
      } else {
        updateMessage(loadingId, {
          isLoading: false,
          content: result.response,
          steps: result.steps,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const reason = error.message || 'AI request was cancelled.';
        updateMessage(loadingId, { isLoading: false, content: `Warning: ${reason}` });
      } else {
        const reason = error instanceof Error ? error.message : 'Unknown error from Tron.';
        updateMessage(loadingId, { isLoading: false, content: `Error: ${reason}` });
      }
    } finally {
      if (agentAbortControllerRef.current === requestController) {
        agentAbortControllerRef.current = null;
      }
      setIsThinking(false);
      inputRef.current?.focus();
    }
  };

  const handleConfirmAction = async (msg: ChatMessage) => {
    if (!msg.pendingAction) return;
    updateMessage(msg.id, { pendingAction: undefined, content: `${msg.content}\n\nConfirmed. Executing commit...` });
    await handleSend(msg.pendingAction.userInput, msg.pendingAction);
  };

  const handleCancelAction = (id: string) => {
    updateMessage(id, { pendingAction: undefined, content: 'Commit cancelled.' });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  /* ---- Render: unauthenticated / loading ---- */
  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="tron-orb-spinner" />
          <p className="text-sm text-muted-foreground font-mono tracking-widest animate-pulse">INITIALIZING TRON...</p>
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-panel p-8 max-w-md w-full text-center space-y-4">
          <Bot className="h-12 w-12 text-primary mx-auto" />
          <p className="text-lg font-semibold text-foreground">Access Required</p>
          <p className="text-sm text-muted-foreground">{bootstrapError}</p>
          <Button asChild>
            <Link to="/signin">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background ambient glows */}
      <div className="tron-bg-glow tron-bg-glow-1" aria-hidden />
      <div className="tron-bg-glow tron-bg-glow-2" aria-hidden />
      <div className="tron-bg-glow tron-bg-glow-3" aria-hidden />

      {/* Page body */}
      <main className="flex-1 flex flex-col pt-20 pb-6 px-4 max-w-4xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-6 gap-4 flex-wrap"
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="text-muted-foreground">
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="tron-agent-avatar">
              <Bot className="h-6 w-6 text-primary" />
              <span className="tron-agent-dot" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground neon-text tracking-wide">
                Tron <span className="text-primary text-sm font-mono">/ CyberX Agent</span>
              </h1>
              <p className="text-xs text-muted-foreground">AI Repository Assistant</p>
            </div>
          </div>

          {/* User badge */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-xs border-border/80"
              onClick={() => setHistoryPanelOpen(true)}
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              History
            </Button>
            {user && (
              <div className="flex items-center gap-2 glass-panel px-3 py-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                  <AvatarFallback className="text-xs">{getInitials(user.fullName || user.username)}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">{user.username}</span>
              </div>
            )}
          </div>
        </motion.div>

        <Sheet open={historyPanelOpen} onOpenChange={setHistoryPanelOpen}>
          <SheetContent side="left" className="w-[92vw] sm:max-w-md border-border bg-card/95 backdrop-blur-xl p-0">
            <div className="h-full flex flex-col">
              <SheetHeader className="px-4 py-4 border-b border-border/70 text-left">
                <SheetTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Conversation History
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Reopen previous chats or delete conversations.
                </SheetDescription>
                <div>
                  <Button size="sm" variant="outline" className="h-8 px-3 text-xs mt-2" onClick={handleNewConversation}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Chat
                  </Button>
                </div>
              </SheetHeader>

              <div className="flex-1 p-3">
                <div className="tron-history-list tron-history-list-panel">
                  {chatThreads.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-2">No previous conversations yet.</p>
                  ) : (
                    chatThreads.map((thread) => {
                      const isActive = thread.id === activeThreadId;
                      const subtitle = thread.repoName || 'No repo selected';
                      return (
                        <div key={thread.id} className={`tron-history-item ${isActive ? 'tron-history-item-active' : ''}`}>
                          <button type="button" onClick={() => handleSelectThread(thread.id)} className="tron-history-item-main">
                            <span className="tron-history-item-title">{thread.title || 'Conversation'}</span>
                            <span className="tron-history-item-meta">{subtitle}</span>
                          </button>
                          <div className="tron-history-item-right">
                            <span className="tron-history-item-time">{formatThreadUpdatedAt(thread.updatedAt)}</span>
                            <button
                              type="button"
                              className="tron-history-delete-btn"
                              onClick={() => handleDeleteConversation(thread.id)}
                              title="Delete conversation"
                              aria-label="Delete conversation"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Repo selector */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-4 relative"
        >
          <button
            id="tron-repo-selector"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRepoDropdownOpen((prev) => !prev);
            }}
            className="tron-repo-selector w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border border-border bg-card/60 text-sm transition-all hover:border-primary/50 focus:outline-none focus:border-primary"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FolderGit2 className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate text-foreground">{selectedRepo ? selectedRepo.name : 'Select a repository...'}</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${repoDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {repoDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute z-50 mt-1 w-full glass-panel border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {repositories.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No repositories found.</p>
                ) : (
                  repositories.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/10 flex items-center gap-2 ${
                        repo.id === selectedRepoId ? 'text-primary bg-primary/5' : 'text-foreground'
                      }`}
                      onClick={() => {
                        setSelectedRepoId(repo.id);
                        setRepoDropdownOpen(false);
                      }}
                    >
                      <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                      <span className="truncate">{repo.name}</span>
                      {pushableRepoIds.has(repo.id) && (
                        <span className="ml-auto text-[10px] font-mono text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                          write
                        </span>
                      )}
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Chat window */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden"
          style={{ minHeight: '480px', maxHeight: 'calc(100vh - 320px)' }}
        >
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 tron-scroll">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  {msg.role !== 'system' && (
                    <div className={`shrink-0 mt-0.5 ${msg.role === 'tron' ? 'tron-msg-avatar' : 'tron-user-avatar'}`}>
                      {msg.role === 'tron' ? (
                        <Bot className="h-4 w-4" />
                      ) : user ? (
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(user.fullName || user.username)}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`flex flex-col gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} ${msg.role === 'system' ? 'w-full items-center' : ''}`}
                  >
                    {msg.role === 'system' ? (
                      <div className="tron-system-msg text-xs font-mono text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-md px-3 py-1.5">
                        {msg.content}
                      </div>
                    ) : (
                      <div className={`tron-bubble ${msg.role === 'tron' ? 'tron-bubble-agent' : 'tron-bubble-user'}`}>
                        {msg.isLoading ? (
                          <TypingDots />
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                              /^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Message actions */}
                    {msg.role === 'tron' && !msg.isLoading && !msg.isWelcome && msg.content.trim() && (
                      <div className="tron-msg-actions">
                        <button
                          type="button"
                          onClick={() => void handleCopyMessage(msg)}
                          className="tron-msg-action-btn"
                          title="Copy response"
                        >
                          {copiedMessageId === msg.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportMessage(msg)}
                          disabled={reportedMessageIds.has(msg.id)}
                          className="tron-msg-action-btn"
                          title="Report response"
                        >
                          <Flag className="h-3.5 w-3.5" />
                          {reportedMessageIds.has(msg.id) ? 'Reported' : 'Report'}
                        </button>
                      </div>
                    )}

                    {/* Steps */}
                    {msg.steps && msg.steps.length > 0 && !msg.isLoading && (
                      <div className="tron-steps">
                        <p className="text-[11px] font-mono text-primary/70 mb-1 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Suggested steps
                        </p>
                        <ul className="space-y-1">
                          {msg.steps.map((step, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-1.5 items-start">
                              <span className="text-primary/50 font-mono">{i + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Commit Confirmation */}
                    {msg.pendingAction && (
                      <div className="tron-confirm-box">
                        <p className="text-xs font-mono text-amber-400/80 mb-2 flex items-center gap-1">Commit confirmation required</p>
                        <pre className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap">
                          {msg.pendingAction.preview}
                        </pre>
                        <div className="flex gap-2">
                          <Button size="sm" className="tron-btn-confirm text-xs" onClick={() => void handleConfirmAction(msg)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" className="tron-btn-cancel text-xs" onClick={() => handleCancelAction(msg.id)}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <span className="text-[10px] text-muted-foreground/50 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* Input area */}
          <div className="p-3 flex items-end gap-2 bg-card/30">
            <textarea
              ref={inputRef}
              id="tron-chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              placeholder={selectedRepo ? `Ask Tron about "${selectedRepo.name}"...` : 'Select a repository to get started...'}
              rows={1}
              className="tron-chat-input flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono disabled:opacity-50"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }}
            />
            <Button
              id="tron-send-btn"
              size="icon"
              onClick={() => void handleSend()}
              disabled={isThinking || !inputValue.trim() || !selectedRepoId}
              className="tron-send-btn shrink-0"
            >
              {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </motion.div>

        {/* Hint chips */}
        {!isThinking && selectedRepo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 flex flex-wrap gap-2">
            {['List all files', 'Show commit history', 'Search for TODO', 'What is this repo about?'].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setInputValue(chip);
                  inputRef.current?.focus();
                }}
                className="tron-chip text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors bg-card/40 font-mono"
              >
                {chip}
              </button>
            ))}
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default TronAgent;
