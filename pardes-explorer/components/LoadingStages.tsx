"use client";

export const LOADING_STAGES = [
  "Identifying sources…",
  "Retrieving texts from Sefaria…",
  "Writing the analysis…",
];

export function LoadingStages({ stage }: { stage: number }) {
  const current = Math.min(stage, LOADING_STAGES.length - 1);
  return (
    <div className="mx-auto mt-12 max-w-md text-center" role="status" aria-live="polite">
      <div className="mb-5 flex justify-center gap-2">
        {LOADING_STAGES.map((label, i) => (
          <span
            key={label}
            className={`h-1.5 w-10 rounded-full transition-colors duration-500 ${
              i <= current ? "bg-gold" : "bg-ink/10"
            }`}
          />
        ))}
      </div>
      <p className="font-display text-lg italic text-ink-soft">
        {LOADING_STAGES[current]}
      </p>
    </div>
  );
}
