# ProxyPrice API v1

ProxyPrice publishes a read-only JSON API for other operator projects that need
the same pricing snapshot used by the public site.

The API is generated at build time from `front/src/data/*.json` and
`data/site-overlays/proxyprice.json`, then served as static files from
Cloudflare Pages. It does not fetch provider websites at request time and does
not write back to global merchant intelligence.

## Base URL

Production:

```text
https://proxyprice.com/api/v1/
```

Preview builds use the same path under the Cloudflare Pages preview URL.

## Versioning

All v1 responses use the same envelope:

```json
{
  "schema_version": "1.0.0",
  "api_version": "v1",
  "site_key": "proxyprice",
  "data_last_updated": "2026-05-25",
  "generated_at": "2026-05-26T08:16:26.000Z",
  "source_hash": "sha256..."
}
```

Breaking response-shape changes must use a new API version path such as
`/api/v2/`.

## Endpoints

```text
GET /api/v1/manifest.json
GET /api/v1/providers.json
GET /api/v1/providers/{provider_slug}.json
GET /api/v1/pricing.json
GET /api/v1/cheapest.json
GET /api/v1/source-status.json
GET /api/v1/export/proxy-merchant-intel-candidates.json
```

`cheapest.json` is a static snapshot. Query strings such as
`?type=residential&limit=10` are safe to use as client-side conventions, but v1
does not dynamically filter on the server. Consumers should use `items` or
`by_proxy_type`.

## Data Boundaries

The API exposes the ProxyPrice published data snapshot:

- provider identity and public website URL
- mapped `merchant_key` when available
- normalized pricing records
- source pricing URL and data observation date
- local `/go/<slug>/` route, not affiliate target URLs

The API must not expose or promote:

- affiliate target URLs
- sponsor locks or site rank boosts
- CTA copy, styling, or editorial rules
- private operator routing
- canonical merchant facts without validation

## Proxy Merchant Intel Candidate Export

`/api/v1/export/proxy-merchant-intel-candidates.json` is intentionally a
candidate package, not a canonical source of truth. It is shaped for later
review by `$proxy-merchant-intel` tooling.

Only cross-site reusable fields belong there:

- `merchant_key`
- `provider_slug`
- homepage URL
- official pricing source URL
- proxy type
- pricing model
- normalized unit
- comparable price fields
- `observed_at`

Before writing anything into
`/Users/butterfly/.codex/skills/proxy-merchant-intel/references/merchants/`,
the importer must run in dry-run mode and the skill validators must pass.

## Local Commands

From `front/`:

```bash
npm run generate:api-data
npm run validate:api
```

`npm run build` also generates the API before Astro builds the static site.

## Validation

The API validator checks:

- required files exist
- envelope fields and `source_hash` are consistent
- provider and pricing counts match source data
- provider detail files exist
- comparable pricing uses `normalized_unit=gb`
- cheapest records are sorted
- candidate export does not contain forbidden site fields
- candidate export does not leak affiliate URLs from `redirects.json`

