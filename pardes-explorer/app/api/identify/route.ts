import { NextResponse } from "next/server";
import { identifySources } from "@/lib/gemini";

// Kept short and separate from fetch-sources/synthesize specifically so each
// serverless invocation finishes well within Vercel's free-plan ~30s edge
// timeout — see app/api/synthesize/route.ts for the full explanation.
export const maxDuration = 25;

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
      {
        status: "error",
        message:
          "Something went wrong while identifying sources. Please try again.",
      },
      { status: 500 }
    );
  }
}
