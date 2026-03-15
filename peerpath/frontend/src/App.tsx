import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "./api/authApi";
import {
  createOrGetThread,
  fetchThread,
  fetchThreads,
  fetchUnreadCount,
  markRead,
  sendMessage,
} from "./api/chatApi";
import { fetchHistory } from "./api/historyApi";
import { fetchMatches } from "./api/matchApi";
import { fetchProfile, updateProfile } from "./api/profileApi";
import {
  PROFILE_COMFORT_LEVEL_OPTIONS,
  PROFILE_HELP_TOPIC_OPTIONS,
  PROFILE_YEAR_OPTIONS,
  TAG_CATEGORIES,
} from "./data";
import type {
  ApiPeerResult,
  AuthUser,
  ChatThread,
  HistoryEntry,
  MatchCard,
  UserProfile,
} from "./types";

type Phase = "form" | "loading" | "results";
type AuthMode = "login" | "register";
type Page = "home" | "how-it-works" | "our-story";

const LOADING_MICRO_MESSAGES = [
  "Checking who has actually been through something close to this.",
  "Comparing emotional tone, not just topic overlap.",
  "Trying to avoid generic matches and surface the most helpful people.",
  "Writing intros that feel like one student talking to another.",
];

const FEATURE_PANELS = [
  {
    title: "Peer matching that goes beyond surface similarity",
    body: "We look at lived experience, emotional tone, and the kind of support someone can realistically offer.",
  },
  {
    title: "Built for moments when students feel isolated",
    body: "From transferring and burnout to dating confusion and housing stress, the flow is designed for vulnerable situations.",
  },
  {
    title: "A warm handoff, not just a ranked list",
    body: "Every match comes with context and a suggested opening message so reaching out feels possible.",
  },
];

const NAV_PAGES: Array<{ id: Page; label: string }> = [
  { id: "how-it-works", label: "How it works" },
  { id: "our-story", label: "Our Story" },
];

const PROFILE_TAG_OPTIONS = TAG_CATEGORIES.flatMap((category) => category.tags);

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreToPercent(score: number, max = 110) {
  return Math.round((clamp(score, 0, max) / max) * 100);
}

function mapPeerToCard(peer: ApiPeerResult, selectedTags: string[]): MatchCard {
  const matchedTags = peer.tags.filter((tag) => selectedTags.includes(tag));
  const tagScorePercent =
    selectedTags.length > 0
      ? Math.round((peer.tag_overlap / selectedTags.length) * 100)
      : 0;
  const experienceScorePercent = scoreToPercent(
    peer.field_score + peer.llm_adjustment,
    100
  );

  return {
    id: peer.peer_id,
    rank: peer.rank,
    name: peer.name,
    major: peer.major,
    year: peer.year,
    contactPhone: peer.contact_phone,
    contactEmail: peer.contact_email,
    tags: peer.tags,
    matchedTags,
    scorePercent: scoreToPercent(peer.final_score),
    tagScorePercent,
    experienceScorePercent,
    explanation: peer.reason || "This peer has navigated a similar situation.",
    conversationStarter:
      peer.conversation_starter ||
      `I noticed you've been through something similar to what I'm dealing with, and I'd really appreciate hearing how you handled it.`,
  };
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Starfield() {
  useEffect(() => {
    const canvas = document.getElementById("ppCanvas") as HTMLCanvasElement | null;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const stars = Array.from({ length: 145 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.7 + 0.35,
      o: Math.random() * 0.5 + 0.12,
      sp: Math.random() * 0.00018 + 0.00004,
      ph: Math.random() * Math.PI * 2,
    }));

    const nodes = Array.from({ length: 11 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      vx: (Math.random() - 0.5) * 0.00014,
      vy: (Math.random() - 0.5) * 0.00014,
    }));

    let tick = 0;
    let frame = 0;

    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const star of stars) {
        const opacity = star.o * (0.55 + 0.45 * Math.sin(tick * star.sp * 800 + star.ph));
        context.beginPath();
        context.arc(star.x * canvas.width, star.y * canvas.height, star.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,203,5,${opacity})`;
        context.fill();
      }

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > 1) node.vx *= -1;
        if (node.y < 0 || node.y > 0.55) node.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = (nodes[i].x - nodes[j].x) * canvas.width;
          const dy = (nodes[i].y - nodes[j].y) * canvas.height;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 200) {
            context.beginPath();
            context.moveTo(nodes[i].x * canvas.width, nodes[i].y * canvas.height);
            context.lineTo(nodes[j].x * canvas.width, nodes[j].y * canvas.height);
            context.strokeStyle = `rgba(255,203,5,${0.07 * (1 - distance / 170)})`;
            context.lineWidth = 0.5;
            context.stroke();
          }
        }
      }

      for (const node of nodes) {
        context.beginPath();
        context.arc(node.x * canvas.width, node.y * canvas.height, 1.5, 0, Math.PI * 2);
        context.fillStyle = "rgba(255,203,5,0.2)";
        context.fill();
      }

      tick += 1;
      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas id="ppCanvas" className="pointer-events-none fixed inset-0 h-full w-full" />;
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>("home");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [showApiBanner, setShowApiBanner] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [cards, setCards] = useState<MatchCard[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authForm, setAuthForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    major: "",
    year: "",
    tags: [] as string[],
    helpTopics: [] as string[],
    comfortLevel: "",
    contactPhone: "",
    contactEmail: "",
    pastChallenge: "",
    searchable: true,
  });

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // openerCardId tracks which match card has the "use opener" section expanded
  const [openerCardId, setOpenerCardId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => {
        setCurrentUser(null);
      });
  }, []);

  useEffect(() => {
    if (phase !== "loading") {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % LOADING_MICRO_MESSAGES.length);
    }, 1800);

    return () => {
      window.clearInterval(interval);
    };
  }, [phase]);

  const selectedSummary = useMemo(() => {
    if (selectedTags.length === 0) {
      return <span className="text-sm text-parchment/30">No tags selected yet</span>;
    }

    return selectedTags.map((tag) => (
      <span
        key={tag}
        className="rounded-full border border-maize/25 bg-maize/10 px-3 py-1 text-xs text-maize"
      >
        {tag}
      </span>
    ));
  }, [selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag]
    );
  };

  const loadHistory = async () => {
    if (!currentUser) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await fetchHistory(currentUser.id);
      setHistoryEntries(result.entries);
    } catch (requestError) {
      setHistoryError(
        requestError instanceof Error ? requestError.message : "Could not load history."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError("Please describe what you're going through before searching.");
      return;
    }

    setError("");
    setShowApiBanner(false);
    setPhase("loading");

    try {
      const result = await fetchMatches({
        tags: selectedTags,
        description: description.trim(),
        user_id: currentUser?.id,
      });

      setCandidateCount(result.total_candidates);
      setCards(result.matches.map((peer) => mapPeerToCard(peer, selectedTags)));
      setPhase("results");
      if (historyOpen) {
        void loadHistory();
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "We couldn't reach the matching service.";
      setShowApiBanner(true);
      setError(message);
      setCards([]);
      setCandidateCount(null);
      setPhase("form");
    }
  };

  const handleReset = () => {
    setActivePage("home");
    setSelectedTags([]);
    setDescription("");
    setPhase("form");
    setError("");
    setShowApiBanner(false);
    setCards([]);
    setCandidateCount(null);
  };

  // ── Chat handlers ────────────────────────────────────────────────────────────
  const activeThread = threads.find((t) => t.thread_id === activeThreadId) ?? null;

  const loadThreads = useCallback(async () => {
    if (!currentUser) return;
    setChatLoading(true);
    try {
      const result = await fetchThreads();
      setThreads(result.threads);
    } finally {
      setChatLoading(false);
    }
  }, [currentUser]);

  const pollUnread = useCallback(async () => {
    if (!currentUser) return;
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    void pollUnread();
    const interval = window.setInterval(() => void pollUnread(), 30_000);
    return () => window.clearInterval(interval);
  }, [currentUser, pollUnread]);

  const openChat = async () => {
    setChatOpen(true);
    await loadThreads();
  };

  const selectThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    await markRead(threadId);
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === threadId ? { ...t, unread_count: 0 } : t))
    );
    setUnreadCount((prev) => Math.max(0, prev - (threads.find((t) => t.thread_id === threadId)?.unread_count ?? 0)));
    // Refresh the active thread messages
    try {
      const result = await fetchThread(threadId);
      setThreads((prev) => prev.map((t) => (t.thread_id === threadId ? result.thread : t)));
    } catch {
      // silent
    }
  };

  // Called from match card "Message" button (with optional opener pre-fill)
  const openChatWithPeer = async (
    card: MatchCard,
    initialMessage?: string,
    isOpener?: boolean,
  ) => {
    if (!currentUser) return;
    setOpenerCardId(null);
    const result = await createOrGetThread({
      peer_id: card.id,
      peer_name: card.name,
      peer_major: card.major,
      peer_year: card.year,
      match_score: card.scorePercent,
      match_reason: card.explanation,
      initial_message: initialMessage,
      is_opener: isOpener,
    });
    const thread = result.thread;
    await loadThreads();
    setChatOpen(true);
    setActiveThreadId(thread.thread_id);
    await markRead(thread.thread_id);
  };

  const handleSendMessage = async () => {
    if (!activeThreadId || !chatInput.trim() || chatSending) return;
    const content = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    try {
      await sendMessage(activeThreadId, content);
      const result = await fetchThread(activeThreadId);
      setThreads((prev) =>
        prev.map((t) => (t.thread_id === activeThreadId ? result.thread : t))
      );
    } finally {
      setChatSending(false);
    }
  };

  // Scroll to bottom of message list when active thread messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages.length]);

  const handleAuthSubmit = async () => {
    setAuthError("");
    setAuthLoading(true);

    try {
      const payload =
        authMode === "register"
          ? await registerUser({
              email: authForm.email,
              full_name: authForm.fullName,
              password: authForm.password,
            })
          : await loginUser({
              email: authForm.email,
              password: authForm.password,
            });

      setCurrentUser(payload.user);
      setAuthOpen(false);
      setAuthForm({ fullName: "", email: "", password: "" });
    } catch (authRequestError) {
      setAuthError(
        authRequestError instanceof Error
          ? authRequestError.message
          : "Authentication failed."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setActivePage("home");
    setCurrentUser(null);
    setHistoryEntries([]);
    setHistoryOpen(false);
    setChatOpen(false);
    setThreads([]);
    setActiveThreadId(null);
    setUnreadCount(0);
    handleReset();
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    await loadHistory();
  };

  const openProfile = async () => {
    setProfileOpen(true);
    setProfileLoading(true);
    setProfileError("");

    try {
      const result = await fetchProfile();
      const profile = result.profile;
      setCurrentProfile(profile);
      setProfileForm({
        major: profile?.major ?? "",
        year: profile?.year ?? "",
        tags: profile?.tags ?? [],
        helpTopics: profile?.help_topics ?? [],
        comfortLevel: profile?.comfort_level ?? "",
        contactPhone: profile?.contact_phone ?? "",
        contactEmail: profile?.contact_email ?? currentUser?.email ?? "",
        pastChallenge: profile?.past_challenges?.[0]?.raw ?? "",
        searchable: profile?.searchable ?? true,
      });
    } catch (requestError) {
      setCurrentProfile(null);
      setProfileForm({
        major: "",
        year: "",
        tags: [],
        helpTopics: [],
        comfortLevel: "",
        contactPhone: "",
        contactEmail: currentUser?.email ?? "",
        pastChallenge: "",
        searchable: true,
      });
      if (requestError instanceof Error) {
        if (requestError.message !== "Request failed with status 404") {
          setProfileError(requestError.message);
        }
      } else {
        setProfileError("Could not load your profile.");
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError("");

    try {
      const payload = {
        major: profileForm.major.trim(),
        year: profileForm.year.trim(),
        tags: profileForm.tags,
        help_topics: profileForm.helpTopics,
        comfort_level: profileForm.comfortLevel.trim(),
        contact_phone: profileForm.contactPhone.trim(),
        contact_email: profileForm.contactEmail.trim(),
        past_challenge: profileForm.pastChallenge.trim(),
        searchable: profileForm.searchable,
      };

      const result = await updateProfile(payload);
      setCurrentProfile(result.profile);
      setProfileOpen(false);
    } catch (requestError) {
      setProfileError(
        requestError instanceof Error ? requestError.message : "Could not save your profile."
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const toggleProfileMultiValue = (
    field: "tags" | "helpTopics",
    value: string
  ) => {
    setProfileForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const showInlineError = phase === "form" && error;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-navy text-parchment">
      <Starfield />

      <div className="relative z-10">
        <nav className="flex items-center justify-between border-b border-maize/10 px-5 py-5 md:px-12">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-3 rounded-full transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-maize/40"
            aria-label="Go to PeerPath home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-maize/20 bg-white/5">
              <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8">
                <path
                  d="M16 11.1C16.86 13.78 18.22 15.14 20.9 16C18.22 16.86 16.86 18.22 16 20.9C15.14 18.22 13.78 16.86 11.1 16C13.78 15.14 15.14 13.78 16 11.1Z"
                  fill="#FFCB05"
                />
                <line
                  x1="16"
                  y1="3.8"
                  x2="16"
                  y2="9"
                  stroke="#FFCB05"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.55"
                />
                <line
                  x1="16"
                  y1="23"
                  x2="16"
                  y2="28.2"
                  stroke="#FFCB05"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.55"
                />
                <line
                  x1="3.8"
                  y1="16"
                  x2="9"
                  y2="16"
                  stroke="#FFCB05"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.55"
                />
                <line
                  x1="23"
                  y1="16"
                  x2="28.2"
                  y2="16"
                  stroke="#FFCB05"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  opacity="0.55"
                />
                <line
                  x1="7.2"
                  y1="7.2"
                  x2="10.8"
                  y2="10.8"
                  stroke="#FFCB05"
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                <line
                  x1="21.2"
                  y1="21.2"
                  x2="24.8"
                  y2="24.8"
                  stroke="#FFCB05"
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                <line
                  x1="24.8"
                  y1="7.2"
                  x2="21.2"
                  y2="10.8"
                  stroke="#FFCB05"
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.3"
                />
                <line
                  x1="10.8"
                  y1="21.2"
                  x2="7.2"
                  y2="24.8"
                  stroke="#FFCB05"
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.3"
                />
              </svg>
            </div>
            <div>
              <div className="font-serif text-2xl tracking-tight text-maize">PeerPath</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-parchment/30">
                UMich
              </div>
            </div>
          </button>

          <div className="hidden items-center gap-7 text-sm text-parchment/45 md:flex">
            {NAV_PAGES.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setActivePage(page.id)}
                className={classNames(
                  "transition hover:text-parchment/80",
                  activePage === page.id ? "text-parchment" : "text-parchment/45"
                )}
              >
                {page.label}
              </button>
            ))}
            {currentUser ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openProfile}
                  className="rounded-full border border-white/10 px-4 py-2 text-parchment/80 transition hover:border-maize/25 hover:text-parchment"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={openHistory}
                  className="rounded-full border border-white/10 px-4 py-2 text-parchment/80 transition hover:border-maize/25 hover:text-parchment"
                >
                  History
                </button>
                <button
                  type="button"
                  onClick={openChat}
                  className="relative rounded-full border border-white/10 px-4 py-2 text-parchment/80 transition hover:border-maize/25 hover:text-parchment"
                >
                  Messages
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-maize text-[10px] font-bold text-navy">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                <span className="text-parchment/70">{currentUser.full_name}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full bg-maize px-4 py-2 text-navy"
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="rounded-full bg-maize px-4 py-2 text-navy"
              >
                Sign in
              </button>
            )}
          </div>
        </nav>

        {activePage === "how-it-works" ? (
          <StaticPage
            eyebrow="How PeerPath Works"
            title="A gentler path from stress to support"
            intro="PeerPath is designed for the moments when a student does not need another generic resource list. They need to feel understood, quickly, and be connected to someone who has lived through something close."
            sections={[
              {
                title: "1. Students describe what they are going through",
                body: "The experience starts with tags and a short written description. That gives students a low-pressure way to explain both the topic and the emotional texture of what is happening, whether that is transfer adjustment, social isolation, burnout, housing stress, or something else deeply personal.",
              },
              {
                title: "2. PeerPath narrows the field with structured matching",
                body: "Behind the scenes, PeerPath first filters for relevant tags, then compares the student’s situation to peers who have already shared their own lived experiences. The system looks beyond a single keyword and tries to understand context, struggle type, emotional signal, and what kind of support might actually help.",
              },
              {
                title: "3. AI helps rank the most relevant peers",
                body: "Once the strongest candidates are identified, PeerPath uses AI to refine which peers feel genuinely helpful rather than superficially similar. The goal is not just to say who overlaps on paper, but who is most likely to offer empathy, perspective, and practical next steps.",
              },
              {
                title: "4. Students receive action-ready matches",
                body: "Instead of a cold directory, students see a ranked list with explanations, contact details, and a suggested opening message. That turns a vulnerable moment into something actionable, reducing the friction of reaching out and making human connection feel more possible.",
              },
            ]}
          />
        ) : activePage === "our-story" ? (
          <StaticPage
            eyebrow="Our Story"
            title="Built by students who wanted campus support to feel human"
            intro="We’re a team of four data science students who built PeerPath after thinking about a simple problem we kept noticing on campus: when students struggle, they usually get sent to resources — but what they often really need is someone who has actually been through the same thing."
            sections={[
              {
                title: "Where the idea came from",
                body: "The idea came to us while participating in Campus AI and the MDC competition. As we talked about student life, we realized that many campus challenges are deeply personal: adjusting as a transfer student, finding friends, choosing a major, dealing with academic stress, or just feeling lost. In those moments, generic advice can feel distant. What helps most is hearing from a real peer who understands.",
              },
              {
                title: "Why we built PeerPath",
                body: "That is why we created PeerPath — an AI-powered peer matching platform that connects students with others who have already faced similar experiences and found a way through. Instead of only giving information, PeerPath helps students find empathy, practical advice, and a starting point for real human connection.",
              },
              {
                title: "What we believe",
                body: "We believe support on campus should feel more personal, more relatable, and more human.",
              },
            ]}
          />
        ) : currentUser ? (
          <>
            <header className="mx-auto max-w-4xl px-6 pb-12 pt-16 text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-maize/25 bg-maize/10 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-maize">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-maize" />
                AI-Powered Campus Matching
              </div>
              <h1 className="font-serif text-5xl leading-tight tracking-tight text-parchment md:text-7xl">
                Find someone who&apos;s been
                <br />
                <em className="italic text-maize">exactly</em> where you are
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-parchment/50 md:text-lg">
                Describe your campus challenge. We&apos;ll match you with peers who&apos;ve already
                navigated the same situation.
              </p>
            </header>

            <main className="mx-auto max-w-4xl px-6 pb-20">
              {showApiBanner && (
                <div className="mb-5 rounded-xl border border-maize/25 bg-maize/10 px-4 py-3 text-sm text-maize/90">
                  The backend request failed, so live matching is currently unavailable. Once the API
                  is healthy again, this page will use the real `/api/match` response.
                </div>
              )}

              {phase !== "results" && (
                <>
                  <section className="mb-4 rounded-3xl border border-maize/15 bg-white/5 p-6 md:p-8">
                    <div className="mb-6 flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-maize/30 bg-maize/10 text-sm text-maize">
                        1
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl text-parchment">
                          What describes your situation?
                        </h2>
                        <p className="mt-1 text-sm text-parchment/40">
                          Select all tags that apply. These help us filter relevant peers.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {TAG_CATEGORIES.map((category) => (
                        <div key={category.label}>
                          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-parchment/35">
                            {category.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {category.tags.map((tag) => {
                              const selected = selectedTags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => toggleTag(tag)}
                                  className={classNames(
                                    "rounded-full border px-4 py-2 text-sm transition",
                                    selected
                                      ? "border-maize bg-maize/10 text-maize"
                                      : "border-white/10 bg-white/5 text-parchment/55 hover:border-maize/30 hover:text-parchment/85"
                                  )}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      {selectedSummary}
                    </div>
                  </section>

                  <section className="mb-4 rounded-3xl border border-maize/15 bg-white/5 p-6 md:p-8">
                    <div className="mb-6 flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-maize/30 bg-maize/10 text-sm text-maize">
                        2
                      </div>
                      <div>
                        <h2 className="font-serif text-2xl text-parchment">
                          Describe your specific challenge
                        </h2>
                        <p className="mt-1 text-sm text-parchment/40">
                          The more detail you share, the better your matches will be.
                        </p>
                      </div>
                    </div>

                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="e.g. I just transferred here and I have no idea how to meet people. I feel like everyone already has their friend groups and I'm starting from zero..."
                      rows={5}
                      className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[15px] leading-7 text-parchment outline-none transition placeholder:text-parchment/30 focus:border-maize/40"
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="mr-1 text-xs text-parchment/30">Try:</span>
                      {[
                        "I transferred here and can't make friends",
                        "Dating on campus feels confusing and overwhelming",
                        "I'm failing my courses and don't know who to ask for help",
                        "I'm an international student struggling to connect",
                      ].map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setDescription(example)}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-parchment/45 transition hover:border-maize/25 hover:text-parchment/80"
                        >
                          {example}
                        </button>
                      ))}
                    </div>

                    {showInlineError && (
                      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                        {error}
                      </div>
                    )}
                  </section>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full rounded-2xl bg-maize px-6 py-5 font-serif text-2xl text-navy transition hover:-translate-y-0.5 hover:shadow-glow"
                  >
                    Find My Peers -&gt;
                  </button>
                </>
              )}

              {phase === "loading" && (
                <section className="py-14 text-center">
                  <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-maize/20 border-t-maize" />
                  <div className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-parchment/50 md:text-base">
                    {LOADING_MICRO_MESSAGES[loadingMessageIndex]}
                  </div>
                </section>
              )}

              {phase === "results" && (
                <section>
                  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="font-serif text-4xl text-parchment">
                        Your <em className="italic text-maize">Matches</em>
                      </h2>
                      <p className="mt-2 text-sm text-parchment/40">
                        {cards.length} match{cards.length === 1 ? "" : "es"}
                        {candidateCount !== null ? ` from ${candidateCount} candidates` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-parchment/45 transition hover:border-maize/25 hover:text-parchment/85"
                    >
                      ← Start over
                    </button>
                  </div>

                  {cards.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-12 text-center text-parchment/45">
                      No matches found. Try selecting different tags or broadening your description.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cards.map((card) => {
                        const otherTags = card.tags.filter(
                          (tag) => !card.matchedTags.includes(tag)
                        );
                        return (
                          <article
                            key={card.id}
                            className={classNames(
                              "rounded-3xl border bg-white/5 p-6 md:p-7",
                              card.rank === 1
                                ? "border-maize/40 bg-maize/5"
                                : "border-maize/15"
                            )}
                          >
                            <div className="flex flex-col gap-5 md:flex-row md:items-start">
                              <div className="flex min-w-0 flex-1 items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-maize/85 font-serif text-xl text-navy">
                                  {card.name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-serif text-3xl leading-none text-parchment">
                                    {card.name}
                                  </div>
                                  <div className="mt-2 text-sm text-parchment/40">
                                    {card.major} · {card.year}
                                  </div>
                                </div>
                              </div>
                              <div className="text-left md:text-right">
                                <div className="font-serif text-4xl leading-none text-maize">
                                  {card.scorePercent}%
                                </div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                                  Match
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                              {card.matchedTags.map((tag) => (
                                <span
                                  key={`matched-${card.id}-${tag}`}
                                  className="rounded-full border border-maize/35 px-3 py-1 text-xs text-maize"
                                >
                                  ✓ {tag}
                                </span>
                              ))}
                              {otherTags.map((tag) => (
                                <span
                                  key={`other-${card.id}-${tag}`}
                                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-parchment/45"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                              {[
                                ["Tag overlap", card.tagScorePercent],
                                ["Experience match", card.experienceScorePercent],
                              ].map(([label, percent]) => (
                                <div key={label}>
                                  <div className="mb-2 flex items-center justify-between text-xs text-parchment/40">
                                    <span>{label}</span>
                                    <span>{percent}%</span>
                                  </div>
                                  <div className="h-1 rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full bg-maize transition-[width] duration-1000"
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="my-6 border-t border-white/10" />

                            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                              Why they&apos;re a great match
                            </div>
                            <p className="text-sm leading-7 text-parchment/80">{card.explanation}</p>

                            <div className="my-6 border-t border-white/10" />

                            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                              Contact
                            </div>
                            <div className="grid gap-3 text-sm text-parchment/75 md:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-[#0b2745] px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                                  Phone
                                </div>
                                <div className="mt-2 break-all">
                                  {card.contactPhone || "Not provided"}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-[#0b2745] px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                                  Email
                                </div>
                                <div className="mt-2 break-all">
                                  {card.contactEmail || "Not provided"}
                                </div>
                              </div>
                            </div>

                            <div className="my-6 border-t border-white/10" />

                            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-parchment/35">
                              Suggested opening message
                            </div>
                            <div className="relative rounded-2xl border border-maize/20 border-l-2 border-l-maize bg-white/5 px-5 py-4">
                              <CopyButton text={card.conversationStarter} />
                              <p className="pr-16 text-sm leading-7 text-parchment/80">
                                {card.conversationStarter}
                              </p>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => void openChatWithPeer(card, card.conversationStarter, true)}
                                className="rounded-full bg-maize px-5 py-2.5 text-sm font-medium text-navy transition hover:-translate-y-0.5 hover:shadow-glow"
                              >
                                Send opener to {card.name} →
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenerCardId(openerCardId === card.id ? null : card.id)
                                }
                                className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-parchment/70 transition hover:border-maize/25 hover:text-parchment"
                              >
                                Write my own message
                              </button>
                            </div>

                            {openerCardId === card.id && (
                              <div className="mt-4 flex gap-2">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder={`Message ${card.name}…`}
                                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-parchment outline-none focus:border-maize/40"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                      void openChatWithPeer(card, e.currentTarget.value.trim(), false);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                    if (input.value.trim()) {
                                      void openChatWithPeer(card, input.value.trim(), false);
                                    }
                                  }}
                                  className="rounded-2xl bg-maize px-4 py-3 text-sm font-medium text-navy transition hover:opacity-90"
                                >
                                  Send
                                </button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </main>
          </>
        ) : (
          <>
            <header className="mx-auto max-w-6xl px-6 pb-16 pt-16">
              <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                <div>
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-maize/25 bg-maize/10 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-maize">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-maize" />
                    Peer support infrastructure for campus life
                  </div>
                  <h1 className="font-serif text-5xl leading-tight tracking-tight text-parchment md:text-7xl">
                    Helping students find
                    <br />
                    <em className="italic text-maize">someone who&apos;s been there</em>
                  </h1>
                  <p className="mt-6 max-w-2xl text-lg leading-8 text-parchment/55">
                    PeerPath is a warm handoff system for moments when students feel stuck,
                    isolated, or unsure where to turn. We match them with peers who have already
                    navigated a similar campus challenge.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("register");
                        setAuthOpen(true);
                      }}
                      className="rounded-full bg-maize px-6 py-3 text-sm font-medium text-navy"
                    >
                      Create an account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("login");
                        setAuthOpen(true);
                      }}
                      className="rounded-full border border-white/10 px-6 py-3 text-sm text-parchment/85 transition hover:border-maize/25"
                    >
                      Sign in
                    </button>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-maize/15 bg-white/5 p-6">
                  <div className="rounded-[1.5rem] border border-white/10 bg-[#07203c]/85 p-5">
                    <div className="mb-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-parchment/35">
                          Demo Preview
                        </div>
                        <div className="mt-2 font-serif text-3xl text-parchment">
                          A calmer path to connection
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[
                        "Transfer adjustment",
                        "Making friends",
                        "Housing stress",
                        "Burnout",
                      ].map((tag) => (
                        <div
                          key={tag}
                          className="inline-flex mr-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-parchment/60"
                        >
                          {tag}
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-2xl border border-maize/15 bg-maize/5 p-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">
                        What students receive
                      </div>
                      <p className="mt-3 text-sm leading-7 text-parchment/75">
                        A ranked list of peers, an explanation for why each one fits, and a gentle
                        opening message that makes the first reach-out feel possible.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 pb-24">
              <section className="grid gap-5 md:grid-cols-3">
                {FEATURE_PANELS.map((panel) => (
                  <article
                    key={panel.title}
                    className="rounded-3xl border border-maize/15 bg-white/5 p-6"
                  >
                    <h2 className="font-serif text-2xl leading-tight text-parchment">
                      {panel.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-parchment/50">{panel.body}</p>
                  </article>
                ))}
              </section>

              <section className="mt-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-3xl border border-maize/15 bg-white/5 p-7">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">
                    How it works
                  </div>
                  <div className="mt-5 space-y-5">
                    {[
                      "Students describe what they are going through in their own words.",
                      "PeerPath narrows the field using tags, then refines results with experience-aware ranking.",
                      "The final screen helps students act immediately instead of freezing at the moment of outreach.",
                    ].map((item, index) => (
                      <div key={item} className="flex items-start gap-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-maize/30 bg-maize/10 text-sm text-maize">
                          {index + 1}
                        </div>
                        <p className="pt-1 text-sm leading-7 text-parchment/55">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-maize/15 bg-white/5 p-7">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">
                    Designed for trust
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[
                      ["Warm onboarding", "The experience starts with emotional clarity, not admin overhead."],
                      ["Actionable outputs", "Students get real next steps instead of vague encouragement."],
                      ["History-aware", "Logged-in users can revisit past searches and continue conversations."],
                      ["Built for campus support", "Suitable for orientation teams, advisors, and student success programs."],
                    ].map(([title, body]) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="font-medium text-parchment">{title}</div>
                        <p className="mt-2 text-sm leading-6 text-parchment/45">{body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </main>
          </>
        )}

        <footer className="border-t border-maize/10 px-6 py-8 text-center text-xs text-parchment/25">
          PeerPath · Built for students, by students · Hackathon Project
        </footer>
      </div>

      {authOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-navy/70 px-6">
          <div className="w-full max-w-md rounded-3xl border border-maize/20 bg-[#0a2747] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl text-parchment">
                  {authMode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mt-2 text-sm text-parchment/45">
                  {authMode === "login"
                    ? "Sign in to save your searches and build your support history."
                    : "Register to save searches, revisit matches, and contact peers later."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                className="text-xl text-parchment/45"
              >
                ×
              </button>
            </div>

            <div className="mb-5 flex rounded-full border border-white/10 bg-white/5 p-1 text-sm">
              {(["login", "register"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAuthMode(mode);
                    setAuthError("");
                  }}
                  className={classNames(
                    "flex-1 rounded-full px-4 py-2 transition",
                    authMode === mode ? "bg-maize text-navy" : "text-parchment/55"
                  )}
                >
                  {mode === "login" ? "Login" : "Register"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {authMode === "register" && (
                <label className="block">
                  <span className="mb-2 block text-sm text-parchment/55">Full name</span>
                  <input
                    value={authForm.fullName}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, fullName: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                    placeholder="Jordan Lee"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm text-parchment/55">Email</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                  placeholder="you@umich.edu"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-parchment/55">Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, password: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                  placeholder="At least 8 characters"
                />
              </label>
            </div>

            {authError && (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={handleAuthSubmit}
              disabled={authLoading}
              className="mt-5 w-full rounded-2xl bg-maize px-4 py-3 font-medium text-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading
                ? "Working..."
                : authMode === "login"
                  ? "Login"
                  : "Create account"}
            </button>
          </div>
        </div>
      )}

      {profileOpen && currentUser && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-navy/70 px-6 py-8">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-3xl border border-maize/20 bg-[#0a2747] p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">
                  Your profile
                </div>
                <h2 className="mt-2 font-serif text-4xl text-parchment">
                  Become discoverable to other students
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-parchment/45">
                  Fill out the experience and contact details you want PeerPath to use when deciding
                  whether to surface you as a helpful match.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="text-xl text-parchment/45"
              >
                ×
              </button>
            </div>

            {profileLoading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-parchment/50">
                Loading your profile...
              </div>
            ) : (
              <>
                <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-parchment/60">
                  Signed in as <span className="text-parchment">{currentUser.email}</span>
                  {currentProfile ? " · existing profile loaded" : " · no profile saved yet"}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Major">
                    <input
                      value={profileForm.major}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, major: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                      placeholder="Computer Science"
                    />
                  </Field>

                  <Field label="Year">
                    <select
                      value={profileForm.year}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, year: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                    >
                      <option value="">Select your year</option>
                      {PROFILE_YEAR_OPTIONS.map((option) => (
                        <option key={option} value={option} className="bg-[#0a2747]">
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Comfort Level">
                    <select
                      value={profileForm.comfortLevel}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          comfortLevel: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                    >
                      <option value="">Select a comfort level</option>
                      {PROFILE_COMFORT_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option} className="bg-[#0a2747]">
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Phone">
                    <input
                      value={profileForm.contactPhone}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          contactPhone: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                      placeholder="+1-734-555-0182"
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Tags">
                      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                        {PROFILE_TAG_OPTIONS.map((tag) => {
                          const selected = profileForm.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleProfileMultiValue("tags", tag)}
                              className={classNames(
                                "rounded-full border px-3 py-2 text-xs transition",
                                selected
                                  ? "border-maize bg-maize/10 text-maize"
                                  : "border-white/10 text-parchment/55 hover:border-maize/25 hover:text-parchment/85"
                              )}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>

                  <div className="md:col-span-2">
                    <Field label="Help Topics">
                      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                        {PROFILE_HELP_TOPIC_OPTIONS.map((topic) => {
                          const selected = profileForm.helpTopics.includes(topic);
                          return (
                            <button
                              key={topic}
                              type="button"
                              onClick={() => toggleProfileMultiValue("helpTopics", topic)}
                              className={classNames(
                                "rounded-full border px-3 py-2 text-xs transition",
                                selected
                                  ? "border-maize bg-maize/10 text-maize"
                                  : "border-white/10 text-parchment/55 hover:border-maize/25 hover:text-parchment/85"
                              )}
                            >
                              {topic}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>

                  <div className="md:col-span-2">
                    <Field label="Email">
                      <input
                        type="email"
                        value={profileForm.contactEmail}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            contactEmail: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                        placeholder="you@umich.edu"
                      />
                    </Field>
                  </div>

                  <div className="md:col-span-2">
                    <Field label="A past challenge you have actually lived through">
                      <textarea
                        value={profileForm.pastChallenge}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            pastChallenge: event.target.value,
                          }))
                        }
                        rows={6}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-parchment outline-none focus:border-maize/40"
                        placeholder="Describe a challenge you faced on campus, what it felt like, and what kind of help or resolution got you through it."
                      />
                    </Field>
                  </div>
                </div>

                <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-parchment/65">
                  <input
                    type="checkbox"
                    checked={profileForm.searchable}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        searchable: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-maize focus:ring-maize"
                  />
                  <span>
                    Let PeerPath include me in other students&apos; match results when my lived
                    experience seems relevant.
                  </span>
                </label>

                {profileError && (
                  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                    {profileError}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    className="rounded-full border border-white/10 px-5 py-3 text-sm text-parchment/75 transition hover:border-maize/25"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="rounded-full bg-maize px-5 py-3 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {chatOpen && currentUser && (
        <div className="fixed inset-0 z-20 flex bg-navy/60">
          {/* Thread list */}
          <div className="flex h-full w-72 shrink-0 flex-col border-r border-maize/15 bg-[#081f39]">
            <div className="flex items-center justify-between border-b border-maize/15 px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">Messages</div>
                <div className="mt-1 font-serif text-2xl text-parchment">Conversations</div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-xl text-parchment/45 hover:text-parchment"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3">
              {chatLoading ? (
                <div className="px-5 py-6 text-sm text-parchment/45">Loading…</div>
              ) : threads.length === 0 ? (
                <div className="px-5 py-6 text-sm leading-7 text-parchment/45">
                  No conversations yet. Find a match and send them a message to get started.
                </div>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.thread_id}
                    type="button"
                    onClick={() => void selectThread(thread.thread_id)}
                    className={classNames(
                      "w-full px-5 py-4 text-left transition hover:bg-white/5",
                      activeThreadId === thread.thread_id ? "bg-maize/10" : ""
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-maize/80 font-serif text-base text-navy">
                        {thread.peer_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-parchment">
                            {thread.peer_name}
                          </span>
                          {thread.unread_count > 0 && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-maize text-[10px] font-bold text-navy">
                              {thread.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-parchment/40">
                          {thread.messages.length > 0
                            ? thread.messages[thread.messages.length - 1].content
                            : "No messages yet"}
                        </div>
                        <div className="mt-1 text-[10px] text-parchment/30">
                          {formatTimestamp(thread.last_message_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message area */}
          <div className="flex flex-1 flex-col bg-[#07203c]">
            {activeThread ? (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-4 border-b border-maize/15 px-6 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-maize/80 font-serif text-lg text-navy">
                    {activeThread.peer_name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-serif text-xl text-parchment">{activeThread.peer_name}</div>
                    <div className="text-xs text-parchment/40">
                      {activeThread.peer_major} · {activeThread.peer_year}
                      {activeThread.match_score > 0 &&
                        ` · ${Math.round(activeThread.match_score)}% match`}
                    </div>
                  </div>
                  {activeThread.match_reason && (
                    <div className="ml-auto max-w-sm rounded-2xl border border-maize/15 bg-maize/5 px-4 py-2 text-xs leading-5 text-maize/70">
                      {activeThread.match_reason}
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  {activeThread.messages.length === 0 ? (
                    <div className="pt-10 text-center text-sm text-parchment/35">
                      No messages yet. Say something!
                    </div>
                  ) : (
                    (() => {
                      const grouped: Array<{ date: string; messages: typeof activeThread.messages }> = [];
                      for (const msg of activeThread.messages) {
                        const label = new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                        }).format(new Date(msg.timestamp));
                        const last = grouped[grouped.length - 1];
                        if (last?.date === label) {
                          last.messages.push(msg);
                        } else {
                          grouped.push({ date: label, messages: [msg] });
                        }
                      }
                      return grouped.map((group) => (
                        <div key={group.date}>
                          <div className="mb-4 flex items-center gap-3 text-xs text-parchment/30">
                            <div className="h-px flex-1 bg-white/10" />
                            {group.date}
                            <div className="h-px flex-1 bg-white/10" />
                          </div>
                          <div className="space-y-3">
                            {group.messages.map((msg) => {
                              const isMe = msg.sender_id === currentUser.id;
                              return (
                                <div
                                  key={msg.message_id}
                                  className={classNames(
                                    "flex",
                                    isMe ? "justify-end" : "justify-start"
                                  )}
                                >
                                  <div
                                    className={classNames(
                                      "max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-6",
                                      isMe
                                        ? "rounded-br-sm bg-maize text-navy"
                                        : "rounded-bl-sm border border-white/10 bg-white/5 text-parchment/85"
                                    )}
                                  >
                                    {msg.is_opener && (
                                      <div className="mb-1 text-[10px] uppercase tracking-widest opacity-60">
                                        AI Suggested Opener
                                      </div>
                                    )}
                                    {msg.content}
                                    <div
                                      className={classNames(
                                        "mt-1 text-[10px]",
                                        isMe ? "text-navy/50" : "text-parchment/30"
                                      )}
                                    >
                                      {new Intl.DateTimeFormat("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      }).format(new Date(msg.timestamp))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="border-t border-maize/15 px-6 py-4">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      placeholder={`Message ${activeThread.peer_name}…`}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-parchment outline-none focus:border-maize/40"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendMessage()}
                      disabled={chatSending || !chatInput.trim()}
                      className="rounded-2xl bg-maize px-5 py-3 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-50 transition hover:opacity-90"
                    >
                      {chatSending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-parchment/35">
                Select a conversation to start reading
              </div>
            )}
          </div>
        </div>
      )}

      {historyOpen && currentUser && (
        <div className="fixed inset-0 z-20 flex justify-end bg-navy/50">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-maize/15 bg-[#081f39] p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">
                  Search History
                </div>
                <h2 className="mt-2 font-serif text-4xl text-parchment">Your recent matches</h2>
                <p className="mt-2 text-sm leading-7 text-parchment/45">
                  Revisit previous searches, remember what you asked, and reopen the peers who felt
                  most relevant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-xl text-parchment/45"
              >
                ×
              </button>
            </div>

            {historyLoading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-parchment/50">
                Loading your saved searches...
              </div>
            ) : historyError ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-400/10 px-5 py-6 text-sm text-red-200">
                {historyError}
              </div>
            ) : historyEntries.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-parchment/50">
                You have no saved searches yet. Once you run your first match, it will appear here.
              </div>
            ) : (
              <div className="space-y-4">
                {historyEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-3xl border border-maize/15 bg-white/5 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-maize/75">
                          {formatTimestamp(entry.timestamp)}
                        </div>
                        <p className="mt-3 text-sm leading-7 text-parchment/75">
                          {entry.description}
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-parchment/50">
                        {entry.matches.length} match{entry.matches.length === 1 ? "" : "es"}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {entry.tags.map((tag) => (
                        <span
                          key={`${entry.id}-${tag}`}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-parchment/50"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 space-y-3">
                      {entry.matches.slice(0, 3).map((match) => (
                        <div
                          key={`${entry.id}-${match.peer_id}`}
                          className="rounded-2xl border border-white/10 bg-[#0b2745] p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="font-medium text-parchment">{match.name}</div>
                              <div className="mt-1 text-xs text-parchment/40">
                                {match.major} · {match.year}
                              </div>
                            </div>
                            <div className="font-serif text-2xl text-maize">
                              {scoreToPercent(match.final_score)}%
                            </div>
                          </div>
                          {match.reason && (
                            <p className="mt-3 text-sm leading-6 text-parchment/60">
                              {match.reason}
                            </p>
                          )}
                          <div className="mt-4 grid gap-2 text-xs text-parchment/55 md:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                              <span className="text-parchment/35">Phone: </span>
                              <span className="break-all">
                                {match.contact_phone || "Not provided"}
                              </span>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                              <span className="text-parchment/35">Email: </span>
                              <span className="break-all">
                                {match.contact_email || "Not provided"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryOpen(false);
                                void openChatWithPeer({
                                  id: match.peer_id,
                                  rank: match.rank,
                                  name: match.name,
                                  major: match.major,
                                  year: match.year,
                                  contactPhone: match.contact_phone,
                                  contactEmail: match.contact_email,
                                  tags: match.tags,
                                  matchedTags: [],
                                  scorePercent: scoreToPercent(match.final_score),
                                  tagScorePercent: 0,
                                  experienceScorePercent: 0,
                                  explanation: match.reason || "This peer has navigated a similar situation.",
                                  conversationStarter: match.conversation_starter || "",
                                });
                              }}
                              className="rounded-full bg-maize px-4 py-2 text-xs font-medium text-navy transition hover:opacity-90"
                            >
                              Message {match.name} →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute right-3 top-3 rounded-md border border-maize/25 bg-maize/10 px-3 py-1 text-xs text-maize transition hover:bg-maize/20"
    >
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

function StaticPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
}) {
  return (
    <>
      <header className="mx-auto max-w-5xl px-6 pb-10 pt-16 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-maize/25 bg-maize/10 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-maize">
          <span className="h-1.5 w-1.5 rounded-full bg-maize" />
          {eyebrow}
        </div>
        <h1 className="font-serif text-5xl leading-tight tracking-tight text-parchment md:text-7xl">
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-parchment/55">{intro}</p>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-5">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-3xl border border-maize/15 bg-white/5 p-7 md:p-8"
            >
              <h2 className="font-serif text-3xl leading-tight text-parchment">
                {section.title}
              </h2>
              <p className="mt-4 max-w-4xl text-base leading-8 text-parchment/60">
                {section.body}
              </p>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <div className="mb-2 block text-sm text-parchment/55">{label}</div>
      {children}
    </div>
  );
}
