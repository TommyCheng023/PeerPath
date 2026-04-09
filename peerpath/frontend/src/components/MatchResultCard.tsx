import { useState } from "react";
import type { MatchCard } from "../types";

interface Props {
  card: MatchCard;
  highlightTopMatch?: boolean;
  onSendMessage: (card: MatchCard, message: string, isOpener: boolean) => Promise<void> | void;
}

export default function MatchResultCard({
  card,
  highlightTopMatch = false,
  onSendMessage,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  async function handleSendCustomMessage() {
    const message = customMessage.trim();
    if (!message) return;
    await onSendMessage(card, message, false);
    setCustomMessage("");
    setComposerOpen(false);
  }

  return (
    <article
      className={[
        "rounded-3xl border bg-white/5 p-6 md:p-7",
        highlightTopMatch ? "border-maize/40 bg-maize/5" : "border-maize/15",
      ].join(" ")}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-maize/85 font-serif text-xl text-navy">
            {card.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-serif text-3xl leading-none text-parchment">{card.name}</div>
            <div className="mt-2 text-sm text-parchment/40">
              {card.major} · {card.year}
            </div>
          </div>
        </div>
        <div className="text-left md:text-right">
          <div className="font-serif text-4xl leading-none text-maize">{card.scorePercent}%</div>
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
        {card.tags
          .filter((tag) => !card.matchedTags.includes(tag))
          .map((tag) => (
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
          <div className="text-[11px] uppercase tracking-[0.18em] text-parchment/35">Phone</div>
          <div className="mt-2 break-all">{card.contactPhone || "Not provided"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0b2745] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-parchment/35">Email</div>
          <div className="mt-2 break-all">{card.contactEmail || "Not provided"}</div>
        </div>
      </div>

      <div className="my-6 border-t border-white/10" />

      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-parchment/35">
        Suggested opening message
      </div>
      <div className="relative rounded-2xl border border-maize/20 border-l-2 border-l-maize bg-white/5 px-5 py-4">
        <CopyButton text={card.conversationStarter} />
        <p className="pr-16 text-sm leading-7 text-parchment/80">{card.conversationStarter}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onSendMessage(card, card.conversationStarter, true)}
          className="rounded-full bg-maize px-5 py-2.5 text-sm font-medium text-navy transition hover:-translate-y-0.5 hover:shadow-glow"
        >
          Send opener to {card.name} →
        </button>
        <button
          type="button"
          onClick={() => setComposerOpen((current) => !current)}
          className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-parchment/70 transition hover:border-maize/25 hover:text-parchment"
        >
          Write my own message
        </button>
      </div>

      {composerOpen && (
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={customMessage}
            autoFocus
            placeholder={`Message ${card.name}…`}
            onChange={(event) => setCustomMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customMessage.trim()) {
                void handleSendCustomMessage();
              }
            }}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-parchment outline-none focus:border-maize/40"
          />
          <button
            type="button"
            onClick={() => void handleSendCustomMessage()}
            className="rounded-2xl bg-maize px-4 py-3 text-sm font-medium text-navy transition hover:opacity-90"
          >
            Send
          </button>
        </div>
      )}
    </article>
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
