import { useEffect, useMemo, useState } from "react";
import { fetchMatches } from "./api/matchApi";
import { TAG_CATEGORIES } from "./data";
import type { ApiPeerResult, MatchCard } from "./types";

type Phase = "form" | "loading" | "results";

const LOADING_STEPS = [
  "Filtering peers by shared tags",
  "Running semantic similarity analysis",
  "Generating personalized explanations",
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
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [cards, setCards] = useState<MatchCard[]>([]);

  useEffect(() => {
    if (phase !== "loading") {
      setLoadingStepIndex(0);
      return;
    }

    const timers = [
      window.setTimeout(() => setLoadingStepIndex(1), 700),
      window.setTimeout(() => setLoadingStepIndex(2), 1600),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [phase]);

  const selectedSummary = useMemo(() => {
    if (selectedTags.length === 0) {
      return (
        <span className="text-sm text-parchment/30">No tags selected yet</span>
      );
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
      });

      setCandidateCount(result.total_candidates);
      setCards(result.matches.map((peer) => mapPeerToCard(peer, selectedTags)));
      setPhase("results");
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
            <button className="rounded-full bg-maize px-4 py-2 text-navy">
              Sign in with uniqname
            </button>
          </div>
        </nav>

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
              <div className="text-base text-parchment/55">Analyzing your situation...</div>
              <div className="mx-auto mt-6 flex max-w-md flex-col gap-3 text-left">
                {LOADING_STEPS.map((step, index) => (
                  <div
                    key={step}
                    className={classNames(
                      "flex items-center gap-3 text-sm transition",
                      index <= loadingStepIndex ? "opacity-100" : "opacity-25"
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-maize" />
                    <span className="text-parchment/50">{step}</span>
                  </div>
                ))}
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

        <footer className="border-t border-maize/10 px-6 py-8 text-center text-xs text-parchment/25">
          PeerPath · Built for students, by students · Hackathon Project
        </footer>
      </div>
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
