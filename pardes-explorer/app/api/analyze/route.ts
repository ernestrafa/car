import { NextResponse } from "next/server";
import { identifySources, synthesizeAnalysis } from "@/lib/claude";
import {
  fetchSources,
  refToUrlSlug,
  sefariaUrl,
  type SefariaSource,
} from "@/lib/sefaria";
import type { AnalysisResult, LevelDetail, PardesLevel } from "@/lib/types";

export const maxDuration = 60;

const LEVELS: PardesLevel[] = ["pshat", "remez", "drush", "sod"];

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid request." },
      { status: 400 }
    );
  }

  const input =
    typeof body === "object" && body !== null && "input" in body
      ? String((body as { input: unknown }).input ?? "").trim()
      : "";

  if (!input) {
    return NextResponse.json(
      {
        status: "error",
        message: "Please enter a pasuk, phrase, question, or topic.",
      },
      { status: 400 }
    );
  }

  try {
    // Step 1: identify candidate sources per PaRDeS level.
    const identification = await identifySources(input);

    if ("declined" in identification) {
      return NextResponse.json({
        status: "declined",
        message: identification.message,
      });
    }

    // Step 2: validate + fetch real texts from Sefaria. Any ref that
    // doesn't resolve is silently dropped — the hallucination filter.
    const sourcesByLevel = {} as Record<PardesLevel, SefariaSource[]>;
    await Promise.all(
      LEVELS.map(async (level) => {
        sourcesByLevel[level] = await fetchSources(
          identification.refs[level] ?? []
        );
      })
    );

    const totalSources = LEVELS.reduce(
      (sum, level) => sum + sourcesByLevel[level].length,
      0
    );

    if (totalSources === 0) {
      return NextResponse.json({
        status: "no-sources",
        message:
          "Couldn't find grounded sources for that — try rephrasing or a more specific pasuk.",
      });
    }

    // Step 3: grounded synthesis using only the real fetched texts.
    const raw = await synthesizeAnalysis(input, identification, sourcesByLevel);

    // Attach real, working Sefaria links — computed from validated ref
    // data, not from whatever string Claude happened to echo back.
    const refToSlug = new Map<string, string>();
    for (const level of LEVELS) {
      for (const src of sourcesByLevel[level]) {
        refToSlug.set(src.ref, src.urlSlug);
      }
    }

    const result: AnalysisResult = {
      topic: raw.topic,
      hebrewTopic: raw.hebrewTopic,
      funFacts: raw.funFacts ?? [],
      levels: Object.fromEntries(
        LEVELS.map((level) => {
          const rawLevel = raw.levels?.[level];
          const detail: LevelDetail = {
            summary: rawLevel?.summary ?? [],
            detailed: {
              explanation: rawLevel?.detailed?.explanation ?? "",
              quotes: (rawLevel?.detailed?.quotes ?? []).map((q) => ({
                ...q,
                sefariaUrl: sefariaUrl(
                  refToSlug.get(q.sefariaRef) ?? refToUrlSlug(q.sefariaRef)
                ),
              })),
            },
          };
          return [level, detail];
        })
      ) as Record<PardesLevel, LevelDetail>,
    };

    return NextResponse.json({ status: "ok", result });
  } catch (err) {
    console.error("analyze route error", err);
    return NextResponse.json(
      {
        status: "error",
        message:
          "Something went wrong while building the analysis. Please try again.",
      },
      { status: 500 }
    );
  }
}
