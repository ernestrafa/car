"use client";

import type { FunFact } from "@/lib/types";

export function FunFacts({ facts }: { facts: FunFact[] }) {
  if (facts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gold/30 bg-gradient-to-br from-[#f4ead0] to-[#ece0c0] p-6 sm:p-8">
      <h2 className="font-display text-2xl text-burgundy">Hidden Gems</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Fun facts and little-known points along the way.
      </p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {facts.map((fact, i) => (
          <li
            key={i}
            className="rounded-xl border border-gold/20 bg-white/50 p-4"
          >
            <p className="font-display text-base font-semibold text-ink">
              {fact.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {fact.fact}
            </p>
            {fact.source && (
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gold">
                {fact.source}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
