# ProxyPrice Deployment

ProxyPrice production is served by Cloudflare Pages. The repository keeps the
frontend static build, Pages Functions, security headers, redirect pages, and
data export assets in one deployable `front/dist` artifact.

## Production Path

The production deploy path is `.github/workflows/cloudflare-pages.yml`.

On pushes to `main`, the workflow:

1. Runs backend pytest through `make test` and `make test-cov`.
2. Runs frontend tests.
3. Runs the Python data pipeline.
4. Validates frontend data and type checks.
5. Builds the Astro site.
6. Runs data validation and linkcheck.
7. Uploads `front/dist` to Cloudflare Pages project `proxyprice`.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required Cloudflare Pages secret:

- `OPENROUTER_API_KEY` for `/api/chat`

Optional Cloudflare Pages variables:

- `PUBLIC_SITE_URL`
- `PUBLIC_FEEDBACK_URL`
- `PUBLIC_COMPARE_PROVIDER_LIMIT`
- `ALLOWED_ORIGINS`

## Manual Validation

Run backend checks locally or in CI:

```bash
cd backend
pytest
```

Run frontend checks on a dependency-capable runtime such as OpenClaw:

```bash
cd front
CI=1 PUPPETEER_SKIP_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
npm audit --json
npm run verify
npm test -- --run
```

Run browser QA against a built preview:

```bash
cd front
npm run build
python3 -m http.server 4327 --directory dist --bind 127.0.0.1
BASE_URL=http://127.0.0.1:4327 npm run qa:browser
```

## Production Smoke

After deployment, verify:

```bash
curl -I https://proxyprice.com/
curl -I https://proxyprice.com/providers/
curl -I https://proxyprice.com/calculator/
curl -I https://proxyprice.com/provider/bright-data/
curl -I https://proxyprice.com/api/v1/export/proxy-merchant-intel-candidates.json
curl -I https://proxyprice.com/sitemap-index.xml
```

The candidate export should return JSON with:

- `export_type: proxy_merchant_intel_candidates`
- `data_last_updated` matching `front/src/data/pricing.json`
- `total_count` matching `items.length`
- no affiliate or ranking fields
- HTTPS `pricing_evidence[].source_url` values
