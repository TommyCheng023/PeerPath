import { useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "./api/authApi";
import { fetchHistory } from "./api/historyApi";
import { fetchMatches } from "./api/matchApi";
import { TAG_CATEGORIES } from "./data";
import type {
  ApiPeerResult,
  AuthUser,
  HistoryEntry,
  MatchCard,
} from "./types";

type Phase = "form" | "loading" | "results";
type AuthMode = "login" | "register";

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
    setSelectedTags([]);
    setDescription("");
    setPhase("form");
    setError("");
    setShowApiBanner(false);
    setCards([]);
    setCandidateCount(null);
  };

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
    setCurrentUser(null);
    setHistoryEntries([]);
    setHistoryOpen(false);
    handleReset();
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    await loadHistory();
  };

  const showInlineError = phase === "form" && error;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-navy text-parchment">
      <Starfield />

      <div className="relative z-10">
        <nav className="flex items-center justify-between border-b border-maize/10 px-5 py-5 md:px-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-maize/20 bg-white/5">
              <svg viewBox="0 0 32 32" fill="none" className="h-8 w-8">
                <circle cx="16" cy="16" r="2.8" fill="#FFCB05" />
                <line x1="16" y1="2" x2="16" y2="9" stroke="#FFCB05" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
                <line x1="16" y1="23" x2="16" y2="30" stroke="#FFCB05" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
                <line x1="2" y1="16" x2="9" y2="16" stroke="#FFCB05" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
                <line x1="23" y1="16" x2="30" y2="16" stroke="#FFCB05" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
              </svg>
            </div>
            <div>
              <div className="font-serif text-2xl tracking-tight text-maize">PeerPath</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-parchment/30">
                UMich
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-7 text-sm text-parchment/45 md:flex">
            <span>How it works</span>
            <span>For advisors</span>
            <span>Stories</span>
            {currentUser ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openHistory}
                  className="rounded-full border border-white/10 px-4 py-2 text-parchment/80 transition hover:border-maize/25 hover:text-parchment"
                >
                  History
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

        {currentUser ? (
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
                              Suggested opening message
                            </div>
                            <div className="relative rounded-2xl border border-maize/20 border-l-2 border-l-maize bg-white/5 px-5 py-4">
                              <CopyButton text={card.conversationStarter} />
                              <p className="pr-16 text-sm leading-7 text-parchment/80">
                                {card.conversationStarter}
                              </p>
                            </div>
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
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-parchment/35">
                          Demo Preview
                        </div>
                        <div className="mt-2 font-serif text-3xl text-parchment">
                          A calmer path to connection
                        </div>
                      </div>
                      <div className="rounded-full border border-maize/20 bg-maize/10 px-3 py-1 text-xs text-maize">
                        Student-first
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
