import { useEffect, useMemo, useRef, useState } from "react";
import { startAgentSession, sendAgentMessage } from "../api/agentApi";
import MatchResultCard from "./MatchResultCard";
import type { AgentMatchResult, AgentMessage, MatchCard } from "../types";

interface Props {
  onSendMessage: (card: MatchCard, message: string, isOpener: boolean) => Promise<void> | void;
}

function scoreToPercent(score: number, max = 110) {
  return Math.round((Math.min(Math.max(score, 0), max) / max) * 100);
}

function mapAgentMatchToCard(match: AgentMatchResult, queryTags: string[]): MatchCard {
  const matchedTags = match.tags.filter((tag) => queryTags.includes(tag));
  return {
    id: match.peer_id,
    rank: match.rank,
    name: match.name,
    major: match.major,
    year: match.year,
    contactPhone: match.contact_phone,
    contactEmail: match.contact_email,
    tags: match.tags,
    matchedTags,
    scorePercent: scoreToPercent(match.final_score),
    tagScorePercent: queryTags.length > 0 ? Math.round((match.tag_overlap / queryTags.length) * 100) : 0,
    experienceScorePercent: scoreToPercent(match.field_score + match.llm_adjustment, 100),
    explanation: match.reason || "This peer has navigated a similar situation.",
    conversationStarter:
      match.conversation_starter ||
      "I noticed you've been through something similar and would really appreciate hearing how you handled it.",
  };
}

export default function AgentChatOverlay({ onSendMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<AgentMatchResult[] | null>(null);
  const [queryTags, setQueryTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const cards = useMemo(
    () => (matches ?? []).map((match) => mapAgentMatchToCard(match, queryTags)),
    [matches, queryTags]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, matches]);

  async function openChat() {
    setOpen(true);
    if (sessionId) return;
    setLoading(true);
    setError("");
    try {
      const resp = await startAgentSession();
      setSessionId(resp.session_id);
      setMessages([{ role: "agent", content: resp.reply }]);
    } catch {
      setError("Couldn't connect to the assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !sessionId || loading) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setLoading(true);
    setError("");
    try {
      const resp = await sendAgentMessage(sessionId, userText);
      setMessages((prev) => [...prev, { role: "agent", content: resp.reply }]);
      if (resp.done) {
        setMatches(resp.matches ?? []);
        setQueryTags(resp.query_tags ?? []);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSessionId(null);
    setMessages([]);
    setMatches(null);
    setQueryTags([]);
    setError("");
    setInput("");
    setOpen(false);
  }

  async function handleSendToPeer(card: MatchCard, message: string, isOpener: boolean) {
    await onSendMessage(card, message, isOpener);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={openChat}
        aria-label="Chat with AI assistant"
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 rounded-full bg-[#FFCB05] px-4 text-[#0a2747] shadow-lg transition-colors hover:bg-[#e6b800]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
        </svg>
        <span className="hidden text-sm font-semibold sm:inline">Ask PeerPath AI</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-[#021221]/72 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex h-[86vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[28px] border border-maize/15 bg-[#081f39] shadow-2xl lg:w-[72vw]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">PeerPath AI</div>
                <div className="mt-1 text-lg font-semibold text-parchment">Talk it through, then get warm matches</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-xl text-parchment/45 transition hover:text-parchment">×</button>
            </div>

            <div className={`min-h-0 flex-1 ${matches === null ? "flex flex-col" : "grid min-h-0 gap-0 lg:grid-cols-[0.75fr_1.25fr]"}`}>
              <div className="flex min-h-0 flex-col border-b border-white/8 lg:border-b-0 lg:border-r lg:border-white/8">
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "rounded-br-sm bg-[#FFCB05] font-medium text-[#0a2747]"
                            : "rounded-bl-sm bg-white/8 text-parchment/90"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-sm bg-white/8 px-4 py-3">
                        <div className="flex items-center gap-1">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="h-1.5 w-1.5 rounded-full bg-parchment/40 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {error && <p className="py-1 text-xs text-red-300">{error}</p>}
                  <div ref={bottomRef} />
                </div>

                {matches === null && (
                  <div className="flex gap-2 border-t border-white/8 px-5 py-4">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      placeholder="Tell PeerPath AI what you're going through…"
                      disabled={loading}
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-parchment placeholder:text-parchment/25 focus:border-[#FFCB05]/40 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || loading}
                      className="rounded-2xl bg-[#FFCB05] px-5 py-3 text-sm font-semibold text-[#0a2747] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>

              {matches !== null && (
                <div className="min-h-0 overflow-y-auto px-5 py-5">
                  <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-maize/80">AI match results</div>
                      <h3 className="mt-2 font-serif text-3xl text-parchment">Suggested peers</h3>
                      <p className="mt-2 text-sm leading-6 text-parchment/50">
                        These recommendations also get saved into your history panel.
                      </p>
                    </div>
                    <button onClick={handleReset} className="rounded-full border border-white/10 px-4 py-2 text-sm text-parchment/60 transition hover:border-maize/25 hover:text-parchment">
                      Start over
                    </button>
                  </div>

                  {cards.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-parchment/45">
                      No strong matches found. Try broadening the situation you describe.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {cards.map((card) => (
                        <MatchResultCard
                          key={card.id}
                          card={card}
                          highlightTopMatch={card.rank === 1}
                          onSendMessage={handleSendToPeer}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
