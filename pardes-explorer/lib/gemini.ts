import { ApiError, GoogleGenAI } from "@google/genai";
import type { SefariaSource } from "./sefaria";
import type { PardesLevel, QuoteBlock, FunFact, SourceIdentification } from "./types";

// flash-lite: smaller/faster model in the same generation, with its own
// capacity pool separate from the full flash model. This task is mechanical
// restatement/formatting (see thinkingConfig below), not deep reasoning, so
// the lite tier is a good fit — and it's markedly less likely to hit the
// "high demand" 503s the full gemini-3.5-flash model was returning.
const MODEL = "gemini-3.1-flash-lite";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** Turns a raw Gemini SDK error into a message worth showing a user,
 * distinguishing "try again in a bit" (rate limit / temporary capacity
 * issue on Google's end) from everything else. */
export function describeGeminiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return "Gemini's free tier is rate-limited right now — wait a minute and try again.";
    }
    if (err.status === 503) {
      return "Gemini is experiencing high demand right now. Google says this is usually temporary — please try again in a moment.";
    }
    if (err.status === 504) {
      return "Gemini took too long to respond this time. Please try again.";
    }
  }
  return "Something went wrong talking to the model. Please try again.";
}

export interface DeclinedResult {
  declined: true;
  message: string;
}

/** Shape the model actually returns for step 3 — sefariaUrl is computed
 * server-side afterward from validated Sefaria data, not by the model. */
export type RawQuoteBlock = Omit<QuoteBlock, "sefariaUrl">;

export interface RawLevelDetail {
  summary: string[];
  quotes: RawQuoteBlock[];
}

export interface RawAnalysisResult {
  topic: string;
  hebrewTopic: string;
  levels: Record<PardesLevel, RawLevelDetail>;
  funFacts: FunFact[];
}

const ORTHODOX_GUARDRAILS = `You are a talmid chacham research assistant helping build a Torah study tool. You operate strictly within Orthodox Jewish mesorah — a Torah miSinai perspective. This is non-negotiable:

- Prefer canonical Orthodox sources: Chumash with Rashi, Ramban, Ibn Ezra, Sforno, Ohr HaChaim, Kli Yakar; Talmud Bavli; Midrash Rabbah and Tanchuma; Rambam; gematria and Baal HaTurim for Remez.
- For Sod, draw on the real range of mainstream Orthodox kabbalistic literature, not the Zohar alone: Sefer Yetzirah; Zohar and Tikkunei Zohar; Ramban's own kabbalistic comments within his Chumash commentary (he explicitly marks many as "al derech ha'emet"/sod); Arizal-based sources as brought down by Chaim Vital (Etz Chaim, Shaarei Kedusha) and later mekubalim (Pardes Rimonim, Shaarei Orah); and later mainstream works that present kabbalistic ideas at a conceptual level, such as Nefesh HaChaim, Derech Hashem, and Tanya. Use whichever of these actually has a real, citable source for the specific topic — do not force the Zohar if a different mainstream sefer is the more natural or better-attested source.
- Sod content must be presented respectfully and at a high level, citing real kabbalistic sources as brought down in mainstream seforim. Never present kabbalah as practical instruction (no meditation techniques, names invocations, or amulets). Note that Sod is traditionally studied with a rebbe.
- If the user's input is not related to Torah, Tanach, Talmud, halacha, Jewish thought, mitzvos, tefillah, or Jewish practice/customs, you must decline.
- Never invent citations. Only reference real, identifiable seforim and sugyos.
- Never write your own translation of a Hebrew text. Any English "quote" you present must be the source's own standard published translation, taken verbatim from what is provided to you — never a paraphrase or rendering in your own words.
- Do not soften, sanitize, water down, or omit halachically strict, severe, or traditionally uncomfortable positions found in the sources. Present classical teachings exactly as they are actually written and understood in the mesorah — do not editorialize to make them more palatable, modern, or comfortable.
- Any summary or explanatory text you write must be a direct, verifiable restatement of something explicitly stated in the source texts provided to you. Never add your own independent interpretation, added meaning, opinion, comparison, or theological commentary beyond what the sources themselves say.`;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([503, 504]);

type GeminiContents = Parameters<
  ReturnType<typeof getClient>["models"]["generateContent"]
>[0]["contents"];

function baseConfig(system: string, maxOutputTokens: number, timeoutMs: number) {
  return {
    systemInstruction: system,
    responseMimeType: "application/json",
    maxOutputTokens,
    // This task is mechanical restatement/formatting, not deep reasoning —
    // thinking would eat time and output-token budget for no benefit.
    thinkingConfig: { thinkingBudget: 0 },
    // We manage retries ourselves (see generateWithRetry) instead of relying
    // on the SDK's default 5-attempt backoff, which can silently burn the
    // whole time budget on a throttled free tier before anything comes back.
    httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
  };
}

/**
 * Calls Gemini once, and — only for transient capacity errors (503
 * UNAVAILABLE / 504 DEADLINE_EXCEEDED, which Google's own error messages
 * describe as temporary) — retries a single time with whatever time remains
 * in the caller's budget. A fast 503 (rejected almost immediately) leaves
 * plenty of budget for a retry; a 504 that already consumed the whole
 * timeout naturally leaves little or none, so this self-limits without any
 * extra bookkeeping.
 */
async function generateWithRetry(
  contents: GeminiContents,
  system: string,
  maxOutputTokens: number,
  budgetMs: number
) {
  const ai = getClient();
  const start = Date.now();
  try {
    return await ai.models.generateContent({
      model: MODEL,
      contents,
      config: baseConfig(system, maxOutputTokens, budgetMs),
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    if (!status || !RETRYABLE_STATUSES.has(status)) throw err;

    const remaining = budgetMs - (Date.now() - start) - 500;
    if (remaining < 4000) throw err;

    await sleep(400);
    return ai.models.generateContent({
      model: MODEL,
      contents,
      config: baseConfig(system, maxOutputTokens, remaining - 400),
    });
  }
}

async function callGeminiJson<T>(
  system: string,
  userPrompt: string,
  maxOutputTokens: number,
  budgetMs: number
): Promise<T> {
  const first = await generateWithRetry(userPrompt, system, maxOutputTokens, budgetMs);
  const firstText = first.text ?? "";

  try {
    return JSON.parse(stripJsonFences(firstText)) as T;
  } catch {
    // retry once with an explicit reminder, replaying the turn as history —
    // this is for malformed JSON, a different failure mode than the
    // transient-error retry above, so it gets its own short fixed slice.
  }

  const ai = getClient();
  const retry = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: [{ text: firstText }] },
      {
        role: "user",
        parts: [
          {
            text: "That was not valid JSON. Return ONLY valid JSON — no markdown fences, no commentary, no trailing text before or after the JSON object.",
          },
        ],
      },
    ],
    config: baseConfig(system, maxOutputTokens, 8000),
  });
  const retryText = retry.text ?? "";

  return JSON.parse(stripJsonFences(retryText)) as T;
}

/**
 * Step 1: identify the topic/pasuk and 2-5 candidate Sefaria refs per PaRDeS
 * level. These refs are candidates only — the caller validates every one
 * against Sefaria before anything is shown to the user or fed back to the model.
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
    "pshat": ["2-3 Sefaria-style refs, e.g. \\"Genesis 1:1\\", \\"Rashi on Genesis 1:1:1\\""],
    "remez": ["3-4 Sefaria-style refs — gematria/Baal HaTurim-oriented where relevant"],
    "drush": ["3-4 Sefaria-style refs — Midrash Rabbah, Tanchuma, homiletic sources"],
    "sod": ["3-4 Sefaria-style refs — pull from the real range of kabbalistic literature (Ramban's sod comments, Sefer Yetzirah, Zohar, Arizal-based works, Tanya, etc.), whichever actually has a real source for this topic"]
  }
}

If the input is a question rather than a text, first anchor it to the most relevant pesukim/sugyos, and put those (and directly related commentaries) in the refs.

If the input is NOT related to Torah, Tanach, Talmud, halacha, Jewish thought, mitzvos, tefillah, or Jewish practice, respond with ONLY this JSON shape instead:

{
  "declined": true,
  "message": "a short, polite explanation that this tool only explores Torah topics through Pshat/Remez/Drush/Sod, and an invitation to try a pasuk or Jewish topic instead"
}

Use precise, real Sefaria reference strings, exactly matching Sefaria's own citation format — this matters, since a slightly-off format silently fails to resolve:
- Tanach: "Genesis 1:1"
- Rashi/Ramban/Ibn Ezra/Sforno/Ohr HaChaim/Kli Yakar on Tanach: "Rashi on Genesis 1:1:1" (commentator, "on", book chapter:verse:comment-number)
- Talmud Bavli: "Berakhot 2a" (tractate, page + a/b — no "Tractate" prefix word)
- Baal HaTurim: "Baal HaTurim on Genesis 1:1"
- Midrash Rabbah: "Bereishit Rabbah 1:1", "Shemot Rabbah 1:1", "Vayikra Rabbah 1:1", "Bamidbar Rabbah 1:1", "Devarim Rabbah 1:1" (book name + "Rabbah" + chapter:paragraph — NOT "Midrash Rabbah, Genesis")
- Midrash Tanchuma: "Tanchuma, Bereshit 1" (parsha name, not chapter number)
- Ramban's sod comments: "Ramban on Genesis 1:1:1" (same pattern as Rashi above — Ramban's Chumash commentary is on Sefaria like any other, and many of his comments are themselves explicitly kabbalistic/sod content, marked "al derech ha'emet")
- Sefer Yetzirah: "Sefer Yetzirah 1:1" (chapter:mishnah)
- Zohar: "Zohar 1:15a" (volume 1-3, matching the printed Vilna edition: 1=Bereshit, 2=Shemot, 3=Vayikra/Bamidbar/Devarim) + page + a/b
- Tanya: "Tanya, Likkutei Amarim 1"

For Sod specifically: "Ramban on [book] [chapter]:[verse]:[comment]" and "Sefer Yetzirah [chapter]:[mishnah]" are the most reliable to get exactly right, since they follow the same predictable numbering as ordinary Tanach/commentary refs — prefer these when a real comment/mishnah exists on the topic, and reach for Zohar/Tanya/Arizal-based refs when they're the more natural or better-attested source instead.

If you aren't fully certain of the exact chapter/paragraph/page within a real sefer, still give your best real citation for that sefer rather than omitting it — a close-but-imprecise ref to a real work is far more useful than skipping the level, since the caller will fall back to the nearest real section if the exact one doesn't resolve. Never invent a sefer, tractate, or commentator that doesn't actually exist.`;

  return callGeminiJson<SourceIdentification | DeclinedResult>(
    system,
    userInput,
    1536,
    45000
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
 * Step 3: grounded synthesis. The model only sees real, Sefaria-fetched texts
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

You will be given the user's original input, the identified topic, and the ACTUAL fetched Hebrew/English source texts for each PaRDeS level (Pshat, Remez, Drush, Sod). You may ONLY quote from the source texts provided below. Every quote's Hebrew and English must be copied verbatim from these texts with its exact citation — the English must be the source's own translation as provided, never your own rendering. If a provided text is not relevant to the topic, omit it rather than forcing it in. If a level has few or no usable sources, return a shorter or empty section for that level rather than padding it with invented content — never fabricate a quote, citation, or explanatory claim that isn't directly grounded in what was provided to you.

Respond with ONLY valid JSON, no markdown fences, in exactly this shape:

{
  "topic": "string",
  "hebrewTopic": "string",
  "levels": {
    "pshat": {
      "summary": ["2-4 short, plain-language bullets. Each bullet must be a direct, verifiable restatement of something explicitly said in the quotes below it — not your own added interpretation, opinion, or theological framing. If the sources say something halachically strict or traditionally difficult, state it plainly rather than softening it."],
      "quotes": [
        {
          "hebrew": "verbatim Hebrew text, copied exactly from the provided sources",
          "english": "verbatim English translation, copied exactly from the provided sources — never your own translation",
          "citation": "e.g. Rashi on Genesis 1:1",
          "sefariaRef": "the exact ref as given in the provided sources",
          "context": "one short factual phrase identifying who/what this source is and where it fits (e.g. 'Rashi's opening comment on this pasuk') — a plain identifier, not interpretive commentary on its meaning or significance"
        }
      ]
    },
    "remez": { "...same shape..." },
    "drush": { "...same shape..." },
    "sod": { "...same shape, and keep it high-level and respectful..." }
  },
  "funFacts": [
    { "title": "short hook, purely descriptive", "fact": "a specific, verifiable point directly grounded in one of the provided source texts above — not a generalization or your own observation", "source": "citation if applicable, else empty string" }
  ]
}

Include 3-5 funFacts, each traceable to a specific provided source. If a level's provided sources are empty, return that level with an empty summary and quotes array rather than inventing content for it.`;

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

  return callGeminiJson<RawAnalysisResult>(system, userPrompt, 4096, 48000);
}
