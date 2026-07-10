import { NextResponse } from "next/server";
import { describeGeminiError, synthesizeAnalysis } from "@/lib/gemini";
import { refToUrlSlug, sefariaUrl, type SefariaSource } from "@/lib/sefaria";
import type {
  AnalysisResult,
  LevelDetail,
  PardesLevel,
  SourceIdentification,
} from "@/lib/types";

// The full pipeline (identify -> fetch Sefaria texts -> synthesize) used to
// be one request. On Vercel's Hobby plan the edge/routing layer enforces its
// own ~30s response ceiling regardless of this route's maxDuration, and the
// combined pipeline routinely ran past that. Splitting it into three
// separate requests (see app/api/identify and app/api/fetch-sources) means
// each individual call only has to finish one step, comfortably under the
// limit — and lets the client show real progress between steps instead of a
// fake timer.
export const maxDuration = 25;

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

  const { input, identification, sourcesByLevel } = (body ?? {}) as {
    input?: string;
    identification?: SourceIdentification;
    sourcesByLevel?: Record<PardesLevel, SefariaSource[]>;
  };

  if (!input || !identification || !sourcesByLevel) {
    return NextResponse.json(
      { status: "error", message: "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const raw = await synthesizeAnalysis(input, identification, sourcesByLevel);

    // Attach real, working Sefaria links — computed from validated ref
    // data, not from whatever string the model happened to echo back.
    const refToSlug = new Map<string, string>();
    for (const level of LEVELS) {
      for (const src of sourcesByLevel[level] ?? []) {
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
            quotes: (rawLevel?.quotes ?? []).map((q) => ({
              ...q,
              sefariaUrl: sefariaUrl(
                refToSlug.get(q.sefariaRef) ?? refToUrlSlug(q.sefariaRef)
              ),
            })),
          };
          return [level, detail];
        })
      ) as Record<PardesLevel, LevelDetail>,
    };

    return NextResponse.json({ status: "ok", result });
  } catch (err) {
    console.error("synthesize route error", err);
    return NextResponse.json(
      { status: "error", message: describeGeminiError(err) },
      { status: 500 }
    );
  }
}
