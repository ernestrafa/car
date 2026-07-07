// Vercel serverless function: GET/PUT the whole Catan dataset.
// Works with the Upstash Redis integration from the Vercel Marketplace.
// If no database is connected yet, it returns 501 and the site
// falls back to saving on the visitor's device (localStorage).

const KEY = "catan-tracker-data";

export default async function handler(req, res) {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(501).json({ error: "no-database-configured" });
  }

  const auth = { Authorization: `Bearer ${token}` };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${url}/get/${KEY}`, { headers: auth });
      const j = await r.json();
      const data = j.result ? JSON.parse(j.result) : null;
      return res.status(200).json({ data });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body.data !== "object") {
        return res.status(400).json({ error: "expected { data: {...} }" });
      }
      const value = JSON.stringify(body.data);
      const r = await fetch(`${url}/set/${KEY}`, {
        method: "POST",
        headers: auth,
        body: value,
      });
      if (!r.ok) throw new Error("redis-set-failed");
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (err) {
    return res.status(500).json({ error: "storage-error" });
  }
}
