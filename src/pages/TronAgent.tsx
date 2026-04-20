import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  ChevronDown,
  FolderGit2,
  LogOut,
  Send,
  Sparkles,
  User,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  timestamp: Date;
  pendingAction?: RepoAgentAction;
};

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
  const navigate = useNavigate();

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

  /* Refs */
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

        /* Initial greeting from Tron */
        setMessages([
          makeMessage(
            'tron',
            `Hi, welcome ${firstName}! 👋\n\nI'm **Tron**, your CyberX Assistant Agent. I can help you explore, analyse, and manage your repositories.\n\nSelect a repository below and ask me anything — list files, search code, view commit history, or even create new commits!`,
          ),
        ]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unable to load session.';
        setBootstrapError(msg);
      } finally {
        setIsBootstrapping(false);
      }
    };
    void bootstrap();
  }, []);

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

  /* ---- Helpers ---- */
  const selectedRepo = repositories.find((r) => r.id === selectedRepoId) ?? null;

  const appendMessage = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);

  const updateMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /* ---- Send handler ---- */
  const handleSend = async (overrideInput?: string, forcedAction?: RepoAgentAction) => {
    const text = (overrideInput ?? inputValue).trim();
    if (!text && !forcedAction) return;
    if (!selectedRepoId) {
      appendMessage(makeMessage('system', '⚠️ Please select a repository first.'));
      return;
    }

    if (!forcedAction && text) {
      appendMessage(makeMessage('user', text));
      setInputValue('');
    }

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
      const reason = error instanceof Error ? error.message : 'Unknown error from Tron.';
      updateMessage(loadingId, { isLoading: false, content: `❌ ${reason}` });
    } finally {
      setIsThinking(false);
      inputRef.current?.focus();
    }
  };

  const handleConfirmAction = async (msg: ChatMessage) => {
    if (!msg.pendingAction) return;
    updateMessage(msg.id, { pendingAction: undefined, content: msg.content + '\n\n✅ Confirmed — executing commit…' });
    await handleSend(msg.pendingAction.userInput, msg.pendingAction);
  };

  const handleCancelAction = (id: string) => {
    updateMessage(id, { pendingAction: undefined, content: '❌ Commit cancelled.' });
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
          <p className="text-sm text-muted-foreground font-mono tracking-widest animate-pulse">
            INITIALIZING TRON…
          </p>
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
      {/* ── Background ambient glows ── */}
      <div className="tron-bg-glow tron-bg-glow-1" aria-hidden />
      <div className="tron-bg-glow tron-bg-glow-2" aria-hidden />
      <div className="tron-bg-glow tron-bg-glow-3" aria-hidden />

      {/* ── Page body ── */}
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
          {user && (
            <div className="flex items-center gap-2 glass-panel px-3 py-1.5">
              <Avatar className="h-6 w-6">
                <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
                <AvatarFallback className="text-xs">{getInitials(user.fullName || user.username)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">{user.username}</span>
            </div>
          )}
        </motion.div>

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
              <span className="truncate text-foreground">
                {selectedRepo ? selectedRepo.name : 'Select a repository…'}
              </span>
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
                      ) : (
                        user ? (
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs">{getInitials(user.fullName || user.username)}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <User className="h-4 w-4" />
                        )
                      )}
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={`flex flex-col gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} ${msg.role === 'system' ? 'w-full items-center' : ''}`}>
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
                              /^\*\*[^*]+\*\*$/.test(part) ? (
                                <strong key={i}>{part.slice(2, -2)}</strong>
                              ) : (
                                part
                              )
                            )}
                          </p>
                        )}
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
                        <p className="text-xs font-mono text-amber-400/80 mb-2 flex items-center gap-1">
                          ⚠️ Commit confirmation required
                        </p>
                        <pre className="text-[11px] text-muted-foreground bg-background/50 rounded p-2 mb-3 overflow-x-auto whitespace-pre-wrap">
                          {msg.pendingAction.preview}
                        </pre>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="tron-btn-confirm text-xs"
                            onClick={() => void handleConfirmAction(msg)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="tron-btn-cancel text-xs"
                            onClick={() => handleCancelAction(msg.id)}
                          >
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
              placeholder={
                selectedRepo
                  ? `Ask Tron about "${selectedRepo.name}"…`
                  : 'Select a repository to get started…'
              }
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
              {isThinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </motion.div>

        {/* Hint chips */}
        {!isThinking && selectedRepo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-3 flex flex-wrap gap-2"
          >
            {[
              'List all files',
              'Show commit history',
              'Search for TODO',
              'What is this repo about?',
            ].map((chip) => (
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
