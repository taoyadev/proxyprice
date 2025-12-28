# ProxyPrice Architecture - The Simplicity Doctrine

**Author**: God of Simplicity
**Philosophy**: Every line of code is a liability. Every service is a failure point. Ship boring, sleep soundly.

---

## The Verdict: Static Site + JSON + Cron

The simplest architecture that solves the problem is not a web application. It is a **static website** that rebuilds when data changes.

```
[CSV Data] --> [Build Script] --> [Static JSON] --> [Cloudflare Pages]
     |                                                      |
     v                                                      v
[Weekly Cron] <-- [SOAX API]                    [User Browser does filtering]
```

---

## Architecture Overview

### What We Build

| Component    | Technology           | Why                         |
| ------------ | -------------------- | --------------------------- |
| Frontend     | Astro + vanilla JS   | Static HTML, zero runtime   |
| Data Store   | JSON files           | No database to crash        |
| Hosting      | Cloudflare Pages     | Free, fast, global CDN      |
| Data Updates | Python script + cron | Runs weekly, generates JSON |
| API Scraping | SOAX Scraping API    | Only when updating prices   |

### What We Do NOT Build

- No backend server
- No database
- No Docker containers
- No authentication
- No admin panel
- No API endpoints
- No real-time updates

---

## Component Details

### 1. Frontend (Astro Static Site)

**Location**: Cloudflare Pages (FREE tier)

```
/src
  /pages
    index.astro          # Main comparison table
    calculator.astro     # Price calculator
    /provider
      [slug].astro       # Provider detail pages (generated at build)
  /data
    providers.json       # All provider data (embedded at build)
    pricing.json         # All pricing tiers
```

**Why Astro?**

- Generates pure HTML at build time
- Zero JavaScript shipped by default
- Islands architecture for calculator interactivity
- A junior dev who knows HTML can modify it

**Client-Side Features** (vanilla JS, no framework):

- Table sorting (50 lines of JS)
- Filtering by proxy type (30 lines of JS)
- Price calculator (100 lines of JS)

Total JS shipped: ~5KB gzipped

### 2. Data Layer (JSON Files)

**Schema - providers.json**:

```json
{
  "providers": [
    {
      "id": "brightdata",
      "name": "Bright Data",
      "website": "https://brightdata.com",
      "affiliate_url": "https://brightdata.com?ref=proxyprice",
      "trial": "7-day free trial",
      "updated_at": "2025-01-15"
    }
  ]
}
```

**Schema - pricing.json**:

```json
{
  "plans": [
    {
      "provider_id": "brightdata",
      "proxy_type": "residential",
      "pricing_model": "per_gb",
      "tiers": [
        { "gb": 1, "price_per_gb": 8.0, "total": 8.0 },
        { "gb": 71, "price_per_gb": 7.0, "total": 499.0 }
      ]
    }
  ]
}
```

**Why JSON files?**

- No database connection issues
- Version controlled with git
- Easy to debug (just open the file)
- Survives any infrastructure failure

### 3. Build Process

```bash
# build.sh - runs locally or in CI
python scripts/parse_csv.py       # Convert CSV to JSON
python scripts/normalize.py       # Calculate $/GB for all tiers
npm run build                     # Astro builds static HTML
# Cloudflare deploys automatically on git push
```

### 4. Data Update Pipeline

```python
# scripts/update_prices.py
# Runs weekly via cron (or manually)

import soax_api
import json

def update_provider(url):
    html = soax_api.scrape(url)
    pricing = parse_pricing_page(html)
    return pricing

# Updates pricing.json
# Commit and push triggers rebuild
```

**Frequency**: Weekly cron job (Sunday 3am)
**Trigger**: `git push` after data update

---

## Project Structure

```
proxyprice/
  frontend/
    src/
      pages/
      components/
      data/           # JSON embedded at build
    astro.config.mjs
    package.json
  scripts/
    parse_csv.py      # Initial CSV import
    normalize.py      # Price normalization
    update_prices.py  # SOAX scraping
  data/
    raw/              # Original CSVs, HTML snapshots
    Price.csv         # Source of truth (until automation)
  .github/
    workflows/
      deploy.yml      # Build and deploy on push
      update.yml      # Weekly price scraping
```

---

## Data Normalization Strategy

The existing CSV has messy pricing. We normalize everything to **$/GB** where possible:

| Original Format     | Normalization                       |
| ------------------- | ----------------------------------- |
| $5/GB               | Direct: $5.00/GB                    |
| $100/month for 50GB | Calculate: $2.00/GB                 |
| $1.50/IP            | Store as-is, display separately     |
| $40/thread          | Store as-is, flag as "thread-based" |

**For non-GB pricing (per-IP, per-thread)**:

- Display raw pricing
- Add tooltip: "Pricing not directly comparable to per-GB plans"
- Future: Add usage calculator for conversion

---

## Deployment Flow

```
Developer pushes to main
        |
        v
GitHub Actions triggers
        |
        v
npm run build (Astro)
        |
        v
Cloudflare Pages deploys
        |
        v
Live in ~60 seconds
```

**Commands**:

```bash
# Local development
npm run dev          # Start dev server

# Production deploy
git push origin main # That's it. Cloudflare does the rest.
```

---

## Cost Estimate (Monthly)

| Service          | Cost            | Notes                         |
| ---------------- | --------------- | ----------------------------- |
| Cloudflare Pages | $0              | Free tier: 500 builds/mo      |
| SOAX API         | ~$50-100        | ~500 page scrapes/week        |
| Domain           | ~$1             | Already own or cheap          |
| **Total**        | **~$50-100/mo** | Could be $0 if manual updates |

**Alternative**: Manual price updates = $0/month

---

## Timeline to MVP

| Week | Deliverable                                      |
| ---- | ------------------------------------------------ |
| 1    | Parse CSV, create JSON schema, basic Astro setup |
| 2    | Main comparison table with sorting/filtering     |
| 3    | Price calculator, provider detail pages          |
| 4    | Polish, SEO, deploy to Cloudflare Pages          |

**Total: 4 weeks to MVP**

Could compress to 2 weeks if we skip:

- Provider detail pages (add in v1.1)
- Advanced calculator (simple version only)

---

## What a Junior Dev Needs to Know

1. **HTML/CSS** - Astro templates are just HTML
2. **Basic JavaScript** - For sorting/filtering
3. **JSON** - Data format
4. **Git** - Push to deploy

No need to learn:

- Docker
- Databases
- Server administration
- Complex build systems

---

## 3am Debugging Guide

| Symptom        | Check                    | Fix               |
| -------------- | ------------------------ | ----------------- |
| Site down      | Cloudflare status        | Wait or check DNS |
| Wrong prices   | data/pricing.json        | Fix JSON, push    |
| Build failing  | GitHub Actions logs      | Fix Astro error   |
| Scraper broken | scripts/update_prices.py | Update selector   |

**Everything is in git. Everything is a file. No mystery state.**

---

## Future Expansion (Only If Needed)

If we need dynamic features later:

1. **User submissions**: Google Forms -> Zapier -> JSON file
2. **Comments/reviews**: Disqus embed (no backend)
3. **API access**: Cloudflare Workers (add when someone asks)
4. **Price alerts**: Email service + simple cron (add when users beg)

**Rule**: Don't build it until three users ask for it.

---

## Rejected Alternatives

| Approach                | Why Rejected                |
| ----------------------- | --------------------------- |
| Next.js with API routes | Server means maintenance    |
| Supabase database       | Overkill for read-only data |
| Docker on VPS           | More moving parts           |
| Headless CMS            | Complexity for 50 providers |
| React SPA               | Heavy for static content    |

---

## The Simplicity Checklist

Before adding anything, ask:

- [ ] Can we solve this with a static file?
- [ ] Does this need to update in real-time? (No)
- [ ] Will a junior dev understand this in 6 months?
- [ ] Can we ship without this feature?
- [ ] Does this add a service to monitor?

If uncertain, **don't add it**.

---

## Summary

| Question         | Answer                         |
| ---------------- | ------------------------------ |
| Backend?         | None                           |
| Database?        | JSON files                     |
| Hosting?         | Cloudflare Pages (free)        |
| Deploy?          | `git push`                     |
| Update data?     | Edit JSON or run Python script |
| Time to MVP?     | 4 weeks                        |
| Monthly cost?    | $0-100                         |
| Junior-friendly? | Yes                            |

---

## Confidence Score: 9/10

**Why 9?**

- Static sites are battle-tested technology
- JSON files cannot have connection issues
- Cloudflare Pages is free and reliable
- Data update flow is manual-first (safe)
- A junior developer can maintain this

**Why not 10?**

- SOAX API scraping may need ongoing selector maintenance
- Some pricing models (per-thread, per-port) are genuinely hard to normalize
- Unknown: Will 50+ provider JSON affect page load? (Likely fine, ~100KB)

---

_"Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away."_ - Antoine de Saint-Exupery

**Ship the boring thing. Sleep well.**
