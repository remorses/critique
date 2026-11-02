---
"critique": patch
---

critique.work now stores uploaded diffs in Cloudflare R2 behind the Cache API instead of Workers KV, so the first view after an upload is served from cache. Free uploads still expire after 7 days. The unused comments widget and its `/a/*` and `/v/:id/annotations` endpoints are removed.
