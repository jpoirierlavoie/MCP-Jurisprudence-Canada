# Security Policy

This repository holds the « Jurisprudence canadienne (CanLII) » MCP connector, a
read-only Cloudflare Worker used by a practising Quebec lawyer to verify case-law
citations. It handles no client data (see *Data handled* below), but it does hold a
personal CanLII API key and a shared authentication secret — both as Cloudflare
Worker secrets, never in this repository.

## Reporting a vulnerability

If you discover a security issue, **do not open a public GitHub issue**. Email the
maintainer directly:

**Contact:** Jason Poirier Lavoie — `jason@poirierlavoie.ca`

Please include:
- A description of the vulnerability
- Steps to reproduce (or a proof-of-concept)
- The potential impact you've identified
- Any suggested mitigation, if you have one

You'll get an initial acknowledgement within 72 hours. Coordinated disclosure is
appreciated — please give a reasonable window to patch before publishing details.

## Scope

In scope:
- The deployed Worker at `jurisprudence.poirierlavoie.ca`
- Code in this repository
- The MCP endpoint (`POST /mcp/<secret>`) and its authentication

Out of scope:
- Social engineering of the maintainer or anyone else
- Physical attacks
- DoS / volumetric attacks
- CanLII's own API, website or data — report those to CanLII
- Issues in third-party dependencies that don't affect this project's specific
  configuration (report those upstream). Note that this Worker ships with **zero
  runtime dependencies**; everything in `package.json` is development-only and never
  reaches the deployed bundle.

## Data handled

This connector is deliberately narrow. What leaves the infrastructure is **citations,
court identifiers and dates** — no client names, no case facts, no documents.

One reservation, stated plainly because it is better known than discovered:
`canlii_find_case` accepts **party names**. If a name searched is that of a party to a
live matter rather than a published decision, the query discloses a research interest
to CanLII. The risk is low — CanLII is a Canadian non-profit and name-based case-law
research is the site's normal use — but it is not nil.

The D1 database stores public case-law metadata plus a `search_log` table used to tune
the citation parser. That log records the citation strings submitted, which for
`canlii_find_case` may include party names.

## Authentication model

The MCP endpoint is protected by a **256-bit shared secret**, accepted either as the
last path segment (`POST /mcp/<secret>`) or as an `Authorization: Bearer` header.
Comparison is constant-time over SHA-256 digests, which also neutralises any length
difference.

What this protects is **the CanLII API key and its quota**, not confidential content —
the metadata served is public. That proportionality is deliberate and documented in
§9.4 of the specification, along with the migration path to OAuth 2.1 should the
connector ever be shared.

Known and accepted properties of this model:
- The secret travels in the URL path, so it must never be logged. `src/index.ts`
  carries an explicit prohibition on logging `request.url`, and every outbound URL is
  passed through `redactUrl()`.
- `GET /health` is unauthenticated and returns `200`. It confirms the service exists
  and nothing else. Setting `MCP_ENABLED=false` returns `404` on every route,
  `/health` included.
- Rotating the secret is a single `wrangler secret put MCP_SHARED_SECRET` followed by
  updating the connector URL; no redeployment of code is required.

## Reproducing the test suite

The full suite runs offline against frozen fixtures — **no API key, no network, no
Cloudflare account required**:

```bash
npm ci && npx wrangler types && npx vitest run
```

A test asserting that the API key never appears in any log output, and a guard suite
asserting that the connector's professional caveats never disappear from tool output,
are both part of that run.
