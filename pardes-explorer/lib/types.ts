export type PardesLevel = "pshat" | "remez" | "drush" | "sod";

export interface QuoteBlock {
  hebrew: string;
  english: string;
  citation: string;
  sefariaRef: string;
  /** Precomputed https://www.sefaria.org/... link for this ref. */
  sefariaUrl: string;
  context: string;
}

export interface LevelDetail {
  summary: string[];
  detailed: {
    explanation: string;
    quotes: QuoteBlock[];
  };
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

export type AnalyzeResponse =
  | { status: "ok"; result: AnalysisResult }
  | { status: "declined"; message: string }
  | { status: "no-sources"; message: string }
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
