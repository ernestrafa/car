"use client";

import { useState } from "react";
import type { LevelDetail, PardesLevel, QuoteBlock } from "@/lib/types";
import { LEVEL_META } from "@/lib/types";

function QuoteBlockView({ quote }: { quote: QuoteBlock }) {
  return (
    <div className="quote-block p-4">
      {quote.hebrew && (
        <p className="font-hebrew text-lg leading-relaxed text-ink">
          {quote.hebrew}
        </p>
      )}
      {quote.english && (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {quote.english}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-ink/10 pt-2">
        <a
          href={quote.sefariaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
        >
          {quote.citation || quote.sefariaRef}
        </a>
      </div>
      {quote.context && (
        <p className="mt-1 text-sm text-ink-soft/80">{quote.context}</p>
      )}
    </div>
  );
}

export function LevelCard({
  level,
  detail,
}: {
  level: PardesLevel;
  detail: LevelDetail;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = LEVEL_META[level];
  const hasQuotes = detail.quotes.length > 0;

  return (
    <section className={`level-card ${meta.className} border p-6 sm:p-7`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-hebrew text-2xl" style={{ color: `var(--level-${level}-accent)` }}>
          {meta.hebrew}
        </span>
        <h2 className="font-display text-2xl text-ink">{meta.english}</h2>
        <span className="text-sm text-ink-soft">— &ldquo;{meta.tagline}&rdquo;</span>
      </header>

      {level === "sod" && (
        <p className="mt-2 text-xs italic text-ink-soft/80">
          Sod is traditionally studied with a rebbe. What follows is a
          high-level, respectful overview — not practical instruction.
        </p>
      )}

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-soft/60">
        AI-generated overview — restated from the primary sources below
      </p>

      {detail.summary.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {detail.summary.map((point, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-ink">
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: `var(--level-${level}-accent)` }}
              />
              {point}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm italic text-ink-soft/80">
          No grounded sources were found for this level.
        </p>
      )}

      {hasQuotes && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-sm font-semibold text-ink-soft underline decoration-dotted underline-offset-4 hover:text-ink"
          aria-expanded={expanded}
        >
          {expanded
            ? "Hide primary sources"
            : `Show primary sources (${detail.quotes.length})`}
        </button>
      )}

      {expanded && hasQuotes && (
        <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft/60">
            Verbatim text and Sefaria&rsquo;s own translation — not AI-generated
          </p>
          {detail.quotes.map((quote, i) => (
            <QuoteBlockView key={i} quote={quote} />
          ))}
        </div>
      )}
    </section>
  );
}
