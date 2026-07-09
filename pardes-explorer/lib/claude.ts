import Anthropic from "@anthropic-ai/sdk";
import type { SefariaSource } from "./sefaria";
import type { PardesLevel, QuoteBlock, FunFact } from "./types";

const MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface SourceIdentification {
  topic: string;
  hebrewTopic: string;
  refs: Record<PardesLevel, string[]>;
}

export interface DeclinedResult {
  declined: true;
  message: string;
}

/** Shape Claude actually returns for step 3 — sefariaUrl is computed
 * server-side afterward from validated Sefaria data, not by Claude. */
export type RawQuoteBlock = Omit<QuoteBlock, "sefariaUrl">;

export interface RawLevelDetail {
  summary: string[];
  detailed: {
    explanation: string;
    quotes: RawQuoteBlock[];
  };
}

export interface RawAnalysisResult {
  topic: string;
  hebrewTopic: string;
  levels: Record<PardesLevel, RawLevelDetail>;
  funFacts: FunFact[];
}

const ORTHODOX_GUARDRAILS = `You are a talmid chacham research assistant helping build a Torah study tool. You operate strictly within Orthodox Jewish mesorah — a Torah miSinai perspective. This is non-negotiable:

- Prefer canonical Orthodox sources: Chumash with Rashi, Ramban, Ibn Ezra, Sforno, Ohr HaChaim, Kli Yakar; Talmud Bavli; Midrash Rabbah and Tanchuma; Rambam; gematria and Baal HaTurim for Remez; Zohar and Arizal-based sources (as brought down in mainstream seforim) for Sod.
- Never cite academic biblical criticism (documentary hypothesis, source criticism, etc.), non-Orthodox denominational commentary (Reform, Conservative, Reconstructionist), or any non-Jewish source.
- Sod content must be presented respectfully and at a high level, citing the Zohar and kabbalistic concepts as brought down in mainstream seforim. Never present kabbalah as practical instruction (no meditation techniques, names invocations, or amulets). Note that Sod is traditionally studied with a rebbe.
- If the user's input is not related to Torah, Tanach, Talmud, halacha, Jewish thought, mitzvos, tefillah, or Jewish practice/customs, you must decline.
- Never invent citations. Only reference real, identifiable seforim and sugyos.`;

function stripJsonFences(text: string): string {
  let t = text.trim();
  const fenceMatch = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) t = fenceMatch[1].trim();
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }
  return t;
}

async function callClaudeJson<T>(
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<T> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  const first = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages,
  });

  const firstText = first.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  try {
    return JSON.parse(stripJsonFences(firstText)) as T;
  } catch {
    // retry once with an explicit reminder
  }

  const retry = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: [
      ...messages,
      { role: "assistant", content: firstText },
      {
        role: "user",
        content:
          "That was not valid JSON. Return ONLY valid JSON — no markdown fences, no commentary, no trailing text before or after the JSON object.",
      },
    ],
  });

  const retryText = retry.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return JSON.parse(stripJsonFences(retryText)) as T;
}

/**
 * Step 1: identify the topic/pasuk and 2-5 candidate Sefaria refs per PaRDeS
 * level. These refs are candidates only — the caller validates every one
 * against Sefaria before anything is shown to the user or fed back to Claude.
 */
export async function identifySources(
  userInput: string
): Promise<SourceIdentification | DeclinedResult> {
  const system = `${ORTHODOX_GUARDRAILS}

Given a user's input (a pasuk, phrase, question, or Torah topic, in English or Hebrew), respond with ONLY valid JSON, no markdown fences, in exactly this shape:

{
  "topic": "string — what the input was identified as, in plain English",
  "hebrewTopic": "string — Hebrew rendering of the topic if applicable, else empty string",
  "refs": {
    "pshat": ["2-5 Sefaria-style refs, e.g. \\"Genesis 1:1\\", \\"Rashi on Genesis 1:1:1\\""],
    "remez": ["2-5 Sefaria-style refs — gematria/Baal HaTurim-oriented where relevant"],
    "drush": ["2-5 Sefaria-style refs — Midrash Rabbah, Tanchuma, homiletic sources"],
    "sod": ["2-5 Sefaria-style refs — Zohar, Arizal-based sources as brought in mainstream seforim"]
  }
}

If the input is a question rather than a text, first anchor it to the most relevant pesukim/sugyos, and put those (and directly related commentaries) in the refs.

If the input is NOT related to Torah, Tanach, Talmud, halacha, Jewish thought, mitzvos, tefillah, or Jewish practice, respond with ONLY this JSON shape instead:

{
  "declined": true,
  "message": "a short, polite explanation that this tool only explores Torah topics through Pshat/Remez/Drush/Sod, and an invitation to try a pasuk or Jewish topic instead"
}

Use precise, real Sefaria reference strings (book chapter:verse, or "Commentator on Book chapter:verse:comment", or Talmud "Tractate page[a/b]", or "Midrash Rabbah, Book chapter:paragraph", or "Zohar, Parsha page[a/b]"). Do not invent sources that don't exist.`;

  return callClaudeJson<SourceIdentification | DeclinedResult>(
    system,
    userInput,
    4096
  );
}

function formatFetchedSources(
  refs: string[],
  sources: SefariaSource[]
): string {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const lines: string[] = [];
  for (const ref of refs) {
    const src = byRef.get(ref);
    if (!src) continue;
    lines.push(`### ${src.ref}`);
    if (src.he) lines.push(`Hebrew: ${src.he}`);
    if (src.en) lines.push(`English: ${src.en}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Step 3: grounded synthesis. Claude only sees real, Sefaria-fetched texts
 * and may only quote from them verbatim — this is the anti-hallucination
 * guarantee. Any level with too few real sources gets a thinner section
 * rather than padding.
 */
export async function synthesizeAnalysis(
  userInput: string,
  identification: SourceIdentification,
  sourcesByLevel: Record<PardesLevel, SefariaSource[]>
): Promise<RawAnalysisResult> {
  const system = `${ORTHODOX_GUARDRAILS}

You will be given the user's original input, the identified topic, and the ACTUAL fetched Hebrew/English source texts for each PaRDeS level (Pshat, Remez, Drush, Sod). You may ONLY quote from the source texts provided below. Every quote must be verbatim from these texts with its exact citation. If a provided text is not relevant to the topic, omit it rather than forcing it in. If a level has few or no usable sources, write a shorter section for that level rather than padding it with invented content — never fabricate a quote or citation that was not provided to you.

Respond with ONLY valid JSON, no markdown fences, in exactly this shape:

{
  "topic": "string",
  "hebrewTopic": "string",
  "levels": {
    "pshat": {
      "summary": ["3-5 simple bullet points, plain language, understandable to a beginner"],
      "detailed": {
        "explanation": "2-4 paragraphs of deeper analysis",
        "quotes": [
          {
            "hebrew": "verbatim Hebrew text from the provided sources",
            "english": "verbatim English translation from the provided sources",
            "citation": "e.g. Rashi on Genesis 1:1",
            "sefariaRef": "the exact ref as given in the provided sources",
            "context": "1-2 sentences on why this source matters here"
          }
        ]
      }
    },
    "remez": { "...same shape..." },
    "drush": { "...same shape..." },
    "sod": { "...same shape, and keep it high-level and respectful..." }
  },
  "funFacts": [
    { "title": "short hook", "fact": "an interesting/little-known point grounded in the provided sources", "source": "citation if applicable, else empty string" }
  ]
}

Include 3-5 funFacts. If a level's provided sources are empty, still include the level with an empty or near-empty quotes array and a short explanation that few grounded sources were found — never invent one.`;

  const userPrompt = `User input: ${userInput}

Identified topic: ${identification.topic} (${identification.hebrewTopic || "no Hebrew rendering"})

=== PSHAT SOURCES ===
${formatFetchedSources(identification.refs.pshat, sourcesByLevel.pshat) || "(none resolved)"}

=== REMEZ SOURCES ===
${formatFetchedSources(identification.refs.remez, sourcesByLevel.remez) || "(none resolved)"}

=== DRUSH SOURCES ===
${formatFetchedSources(identification.refs.drush, sourcesByLevel.drush) || "(none resolved)"}

=== SOD SOURCES ===
${formatFetchedSources(identification.refs.sod, sourcesByLevel.sod) || "(none resolved)"}`;

  return callClaudeJson<RawAnalysisResult>(system, userPrompt, 8192);
}
