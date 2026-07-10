import type { SefariaSource } from "./sefaria";

export type PardesLevel = "pshat" | "remez" | "drush" | "sod";

export interface SourceIdentification {
  topic: string;
  hebrewTopic: string;
  refs: Record<PardesLevel, string[]>;
}

export interface QuoteBlock {
  /** Verbatim Hebrew, straight from the source text. */
  hebrew: string;
  /** Verbatim English, straight from Sefaria's own published translation
   * of this source — never an AI-generated translation. */
  english: string;
  citation: string;
  sefariaRef: string;
  /** Precomputed https://www.sefaria.org/... link for this ref. */
  sefariaUrl: string;
  /** A short, purely factual identifier for the source (who/what/where —
   * e.g. "Rashi's opening comment on this pasuk"). Never interpretive
   * commentary on meaning. */
  context: string;
}

export interface LevelDetail {
  /** Short, plain-language bullets. Each one must be a direct restatement
   * of something explicitly said in the quotes below — no AI interpretation,
   * opinion, or softening beyond what the sources themselves say. */
  summary: string[];
  quotes: QuoteBlock[];
}

export interface FunFact {
  title: string;
  fact: string;
  source: string;
}

export interface AnalysisResult {
  topic: string;
  hebrewTopic: string;
  levels: Record<PardesLevel, LevelDetail>;
  funFacts: FunFact[];
}

// The pipeline is split across three separate API calls (rather than one
// long request) so each individual serverless invocation finishes well
// within Vercel's free-plan edge timeout, and so the loading UI can reflect
// real progress instead of a fake timer.

export type IdentifyResponse =
  | { status: "ready"; identification: SourceIdentification }
  | { status: "declined"; message: string }
  | { status: "error"; message: string };

export type FetchSourcesResponse =
  | { status: "ready"; sourcesByLevel: Record<PardesLevel, SefariaSource[]> }
  | { status: "no-sources"; message: string }
  | { status: "error"; message: string };

export type SynthesizeResponse =
  | { status: "ok"; result: AnalysisResult }
  | { status: "error"; message: string };

export const LEVEL_META: Record<
  PardesLevel,
  { hebrew: string; english: string; tagline: string; className: string }
> = {
  pshat: {
    hebrew: "פשט",
    english: "Pshat",
    tagline: "The Plain Meaning",
    className: "level-pshat",
  },
  remez: {
    hebrew: "רמז",
    english: "Remez",
    tagline: "The Hint",
    className: "level-remez",
  },
  drush: {
    hebrew: "דרוש",
    english: "Drush",
    tagline: "The Homiletic",
    className: "level-drush",
  },
  sod: {
    hebrew: "סוד",
    english: "Sod",
    tagline: "The Secret",
    className: "level-sod",
  },
};

export const LEVEL_ORDER: PardesLevel[] = ["pshat", "remez", "drush", "sod"];
