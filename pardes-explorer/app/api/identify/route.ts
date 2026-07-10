import { NextResponse } from "next/server";
import { describeGeminiError, identifySources } from "@/lib/gemini";

// Split from fetch-sources/synthesize so each serverless invocation only
// does one step — see app/api/synthesize/route.ts for the full explanation.
// maxDuration was originally 25s; Vercel's Runtime Logs showed timeouts
// reading exactly "after 25 seconds", proving this config value (not some
// separate platform ceiling) was the actual limit, so it's raised here to
// give Gemini calls real breathing room against transient 503/504s.
export const maxDuration = 55;

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
    const identification = await identifySources(input);

    if ("declined" in identification) {
      return NextResponse.json({
        status: "declined",
        message: identification.message,
      });
    }

    return NextResponse.json({ status: "ready", identification });
  } catch (err) {
    console.error("identify route error", err);
    return NextResponse.json(
      { status: "error", message: describeGeminiError(err) },
      { status: 500 }
    );
  }
}
