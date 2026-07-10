const SEFARIA_API_BASE = "https://www.sefaria.org/api";

export interface SefariaSource {
  /** Canonical Sefaria ref, e.g. "Rashi on Genesis 1:1:1" */
  ref: string;
  /** Hebrew rendering of the ref, e.g. "רש״י על בראשית א׳:א׳:א׳" */
  heRef: string;
  /** URL path segment for sefaria.org, e.g. "Rashi_on_Genesis.1.1.1" */
  urlSlug: string;
  he: string;
  en: string;
}

/** Strips HTML tags/entities Sefaria embeds in text (footnote markup, <i>, <br>, etc). */
export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sefaria's he/text fields can be a string, or an arbitrarily nested array of strings. */
function flattenText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return stripHtml(value);
  if (Array.isArray(value)) {
    return value
      .map(flattenText)
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

/** Best-effort ref -> url-slug conversion, used as a fallback when a ref
 * didn't come through resolveRef (e.g. Claude echoed a citation slightly
 * differently than the resolved ref). */
export function refToUrlSlug(ref: string): string {
  return ref.replace(/:/g, ".").replace(/ /g, "_");
}

/**
 * Validates a ref against Sefaria's name-resolution API and returns the
 * canonical ref + url slug, or null if it doesn't resolve to a real text.
 * This is the hallucination filter: any ref Claude invents that Sefaria
 * doesn't recognize is silently dropped by the caller.
 */
export async function resolveRef(
  rawRef: string
): Promise<{ ref: string; urlSlug: string } | null> {
  try {
    const res = await fetch(
      `${SEFARIA_API_BASE}/name/${encodeURIComponent(rawRef)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (!data?.is_ref || typeof data.ref !== "string" || !data.ref) {
      return null;
    }

    const urlSlug =
      typeof data.url === "string" && data.url
        ? data.url
        : refToUrlSlug(data.ref);

    return { ref: data.ref, urlSlug };
  } catch {
    return null;
  }
}

async function fetchResolvedText(resolved: {
  ref: string;
  urlSlug: string;
}): Promise<SefariaSource | null> {
  try {
    const res = await fetch(
      `${SEFARIA_API_BASE}/texts/${encodeURIComponent(resolved.ref)}?context=0&commentary=0`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const he = flattenText(data.he);
    const en = flattenText(data.text);

    if (!he && !en) return null;

    return {
      ref: typeof data.ref === "string" && data.ref ? data.ref : resolved.ref,
      heRef: typeof data.heRef === "string" ? data.heRef : "",
      urlSlug: resolved.urlSlug,
      he,
      en,
    };
  } catch {
    return null;
  }
}

/** Drops the last ":segment" or " segment" of a ref, e.g.
 * "Bereishit Rabbah 1:2" -> "Bereishit Rabbah 1", "Zohar 1:15b" -> "Zohar 1".
 * Returns null once there's nothing left to trim. */
function widenRef(ref: string): string | null {
  const colonIdx = ref.lastIndexOf(":");
  if (colonIdx > 0) return ref.slice(0, colonIdx);
  const spaceIdx = ref.lastIndexOf(" ");
  if (spaceIdx > 0) return ref.slice(0, spaceIdx);
  return null;
}

/**
 * Validates a ref, then fetches its Hebrew/English text. If the model's
 * proposed ref is close but not exact (e.g. the wrong paragraph/page within
 * a real, existing section), a ref this precise routinely fails outright
 * rather than silently landing on a neighboring real one — so on failure
 * this progressively widens the ref (dropping the most specific component)
 * and retries, up to twice, before giving up. Every result returned this way
 * is still a real, Sefaria-resolved, non-fabricated text — just possibly at
 * the section level instead of the exact paragraph the model guessed.
 */
export async function fetchSource(rawRef: string): Promise<SefariaSource | null> {
  let ref: string | null = rawRef;
  for (let attempt = 0; attempt < 3 && ref; attempt++) {
    const resolved = await resolveRef(ref);
    if (resolved) {
      const source = await fetchResolvedText(resolved);
      if (source) return source;
    }
    ref = widenRef(ref);
  }
  return null;
}

/** Fetches many refs in parallel and silently drops any that don't resolve. */
export async function fetchSources(refs: string[]): Promise<SefariaSource[]> {
  const unique = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
  const results = await Promise.all(unique.map((ref) => fetchSource(ref)));
  return results.filter((r): r is SefariaSource => r !== null);
}

export function sefariaUrl(urlSlug: string): string {
  return `https://www.sefaria.org/${urlSlug}`;
}
