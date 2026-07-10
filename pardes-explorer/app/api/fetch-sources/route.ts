import { NextResponse } from "next/server";
import { fetchSources, type SefariaSource } from "@/lib/sefaria";
import type { PardesLevel, SourceIdentification } from "@/lib/types";

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

  const identification = (
    body as { identification?: SourceIdentification } | null
  )?.identification;

  if (!identification || typeof identification !== "object") {
    return NextResponse.json(
      { status: "error", message: "Invalid request." },
      { status: 400 }
    );
  }

  try {
    // Validate + fetch real texts from Sefaria. Any ref that doesn't
    // resolve is silently dropped — the hallucination filter.
    const sourcesByLevel = {} as Record<PardesLevel, SefariaSource[]>;
    await Promise.all(
      LEVELS.map(async (level) => {
        sourcesByLevel[level] = await fetchSources(
          identification.refs?.[level] ?? []
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

    return NextResponse.json({ status: "ready", sourcesByLevel });
  } catch (err) {
    console.error("fetch-sources route error", err);
    return NextResponse.json(
      {
        status: "error",
        message:
          "Something went wrong while retrieving sources. Please try again.",
      },
      { status: 500 }
    );
  }
}
