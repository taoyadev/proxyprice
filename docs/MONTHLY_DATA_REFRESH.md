# ProxyPrice Monthly Data Refresh

ProxyPrice uses a layered data model:

- global reusable merchant facts live in `/Users/butterfly/.codex/skills/proxy-merchant-intel`
- long-form research and unresolved contradictions live in `/Users/butterfly/.codex/knowledge/proxy-guru-wiki`
- ProxyPrice-only routing, affiliate, and publish controls live in `data/site-overlays/proxyprice.json`

## Monthly Workflow

Default cadence: run on the first day of each month at 09:00 Asia/Shanghai.

Run from the repository root:

```bash
cd backend
make monthly-refresh
pytest
cd ../front
npm run verify
```

`make monthly-report` is the non-refresh version. It writes the overlay and report, syncs redirects, and leaves frontend `last_updated` untouched.

## What The Script Does

`backend/scripts/monthly_update.py`:

- maps every `front/src/data/providers.json` provider to the global merchant universe and bundle index
- writes or updates `data/site-overlays/proxyprice.json`
- syncs `front/src/data/redirects.json` from the overlay
- compares current per-GB prices with structured bundle entry-price evidence
- holds missing bundles, unit mismatches, and large price deltas for review
- writes `reports/monthly/YYYY-MM.md`

It does not infer prices from prose, login-only pages, configurators, or quote-based products.

## Safety Rules

- Price changes must have a public official `source_url`, `observed_at`, pricing model, and normalized unit.
- Missing merchant bundles are `onboarding_required`; they must not be auto-rewritten.
- Per-IP, per-proxy, per-thread, and quote-based products stay outside the $/GB calculator ranking.
- Affiliate links and `go` routing stay in the ProxyPrice overlay, not in global merchant bundles.
- GitHub deploy workflows should validate and deploy committed data only. They must not run a fake daily freshness refresh.

## Validation

Use this chain after a monthly refresh:

```bash
python3 backend/scripts/run_pipeline.py
cd backend && pytest
cd ../front && npm run verify
cd /Users/butterfly/.codex/skills/proxy-merchant-intel
python3 scripts/validate_merchant_bundles.py
python3 scripts/validate_merchant_universe.py
python3 scripts/validate_market_baseline.py
python3 scripts/validate_ranking_memory.py
```

`scripts/validate_review_policy.py` currently references a separate `proxysites/backend` control plane. Treat failures from that external path as global control-plane drift, not as a ProxyPrice site failure.
