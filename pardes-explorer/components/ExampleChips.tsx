"use client";

const EXAMPLES = [
  "Bereishis 1:1",
  "Why do we dip the apple in honey?",
  "Yaakov and the ladder",
  "Lecha Dodi",
];

export function ExampleChips({
  onPick,
}: {
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {EXAMPLES.map((example) => (
        <button
          key={example}
          type="button"
          onClick={() => onPick(example)}
          className="rounded-full border border-ink/15 bg-white/50 px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-gold/60 hover:bg-white/80"
        >
          {example}
        </button>
      ))}
    </div>
  );
}
