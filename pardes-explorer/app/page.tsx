"use client";

import { useEffect, useRef, useState } from "react";
import { ExampleChips } from "@/components/ExampleChips";
import { LoadingStages, LOADING_STAGES } from "@/components/LoadingStages";
import { LevelCard } from "@/components/LevelCard";
import { FunFacts } from "@/components/FunFacts";
import { LEVEL_ORDER } from "@/lib/types";
import type { AnalysisResult, AnalyzeResponse } from "@/lib/types";

type UiState =
  | { kind: "idle" }
  | { kind: "loading"; stage: number }
  | { kind: "result"; result: AnalysisResult }
  | { kind: "message"; message: string }
  | { kind: "error"; message: string };

const CACHE_KEY = "pardes-explorer-cache-v1";

function readCache(): Record<string, AnalysisResult> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AnalysisResult>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, AnalysisResult>) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage unavailable (private browsing, quota) — non-fatal
  }
}

export default function Home() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<UiState>({ kind: "idle" });
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, []);

  async function runQuery(query: string) {
    const trimmed = query.trim();
    if (!trimmed || state.kind === "loading") return;

    const cache = readCache();
    if (cache[trimmed]) {
      setState({ kind: "result", result: cache[trimmed] });
      return;
    }

    setState({ kind: "loading", stage: 0 });
    if (stageTimer.current) clearInterval(stageTimer.current);
    stageTimer.current = setInterval(() => {
      setState((prev) =>
        prev.kind === "loading"
          ? { kind: "loading", stage: Math.min(prev.stage + 1, LOADING_STAGES.length - 1) }
          : prev
      );
    }, 3200);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed }),
      });
      const data: AnalyzeResponse = await res.json();

      if (data.status === "ok") {
        const nextCache = { ...cache, [trimmed]: data.result };
        writeCache(nextCache);
        setState({ kind: "result", result: data.result });
      } else if (data.status === "declined") {
        setState({ kind: "message", message: data.message });
      } else if (data.status === "no-sources") {
        setState({ kind: "error", message: data.message });
      } else {
        setState({ kind: "error", message: data.message });
      }
    } catch {
      setState({
        kind: "error",
        message:
          "Couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      if (stageTimer.current) {
        clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") runQuery(input);
  }

  const isLoading = state.kind === "loading";

  return (
    <div className="flex-1">
      <main className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-24 pt-16 sm:pt-24">
        <header className="text-center">
          <h1 className="font-display text-4xl font-semibold text-ink sm:text-5xl">
            PaRDeS Explorer
          </h1>
          <p className="mt-3 text-base text-ink-soft sm:text-lg">
            Explore Torah through Pshat, Remez, Drush, and Sod — with real
            sources.
          </p>
        </header>

        <div className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a pasuk, phrase, question, or topic…"
              dir="auto"
              disabled={isLoading}
              className="flex-1 rounded-xl border border-ink/15 bg-white/70 px-4 py-3 text-base text-ink placeholder:text-ink-soft/50 shadow-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => runQuery(input)}
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-ink px-6 py-3 font-display text-base font-semibold text-parchment shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Explore
            </button>
          </div>
          <ExampleChips
            onPick={(value) => {
              setInput(value);
              runQuery(value);
            }}
          />
        </div>

        <div className="mt-12">
          {state.kind === "idle" && (
            <p className="text-center text-sm text-ink-soft/70">
              Enter something above, or tap an example, to begin.
            </p>
          )}

          {state.kind === "loading" && <LoadingStages stage={state.stage} />}

          {state.kind === "message" && (
            <div className="mx-auto max-w-xl rounded-xl border border-gold/30 bg-white/50 p-6 text-center">
              <p className="text-ink-soft">{state.message}</p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="mx-auto max-w-xl rounded-xl border border-burgundy/30 bg-white/50 p-6 text-center">
              <p className="text-burgundy">{state.message}</p>
            </div>
          )}

          {state.kind === "result" && (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="font-display text-2xl text-ink">
                  {state.result.topic}
                </h2>
                {state.result.hebrewTopic && (
                  <p className="font-hebrew mt-1 text-xl text-ink-soft">
                    {state.result.hebrewTopic}
                  </p>
                )}
              </div>

              {LEVEL_ORDER.map((level) => (
                <LevelCard
                  key={level}
                  level={level}
                  detail={state.result.levels[level]}
                />
              ))}

              <FunFacts facts={state.result.funFacts} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
