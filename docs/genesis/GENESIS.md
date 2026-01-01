# ProxyPrice - GENESIS Document

## 1. Executive Summary

ProxyPrice is a transparent price comparison platform for proxy services - the "diskprices.com for proxies." In a market where pricing is intentionally complex (per-GB, per-IP, per-thread, tiered, with hidden fees), we provide normalized, comparable pricing data to help users find the right proxy provider for their specific use case. The platform prioritizes static generation for performance, while maintaining a robust data pipeline for automated price updates.

---

## 2. Recommended Stack

Synthesizing the best elements from Performance (9/10), Robustness (8/10), and Simplicity (9/10) architectures:

| Layer                   | Choice                                  | Source                   | Why                                                                                      |
| ----------------------- | --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| **Frontend Framework**  | Astro + Islands                         | Performance + Simplicity | Zero JS by default, islands for calculator. Both highest-confidence architectures agree. |
| **Interactivity**       | Preact (6KB)                            | Performance              | Signals-based reactivity for calculator only. Lighter than full React.                   |
| **Hosting**             | Cloudflare Pages                        | All Three                | Free tier, global CDN, 300+ edge locations. Unanimous choice.                            |
| **Edge Caching**        | Cloudflare KV                           | Performance + Robustness | <10ms reads, stale-while-revalidate pattern.                                             |
| **Primary Data Store**  | Supabase PostgreSQL                     | Robustness               | Existing infrastructure, schema isolation, audit logging capability.                     |
| **Runtime Data**        | Static JSON (embedded at build)         | Simplicity + Performance | Data is small (~100KB for 50 providers), eliminate runtime DB calls.                     |
| **Data Pipeline**       | Python scripts + cron                   | Simplicity               | Weekly updates via SOAX API. Simple to debug and maintain.                               |
| **Price Normalization** | Build-time calculation                  | Performance + Simplicity | Pre-compute all $/GB metrics, embed in JSON.                                             |
| **Filtering/Sorting**   | CSS-first, JS fallback                  | Performance              | CSS `:has()` for simple filters, vanilla JS for complex combinations.                    |
| **Error Handling**      | Circuit breakers + graceful degradation | Robustness               | Serve stale data on backend failure.                                                     |

---

## 3. Trade-offs Accepted

### What We're Sacrificing (and Why It's OK for MVP)

| Sacrifice                       | Rationale                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------- |
| **Real-time price updates**     | Proxy prices change weekly, not hourly. Weekly batch updates are sufficient.  |
| **User accounts**               | Out of scope for MVP. Can add later if needed for price alerts.               |
| **Server-side filtering API**   | All data embedded in static build (~100KB). Client-side filtering is instant. |
| **Database queries at runtime** | Static JSON eliminates database as runtime dependency. Build-time only.       |
| **Complex admin panel**         | Manual JSON edits + git push. Engineers can handle this for MVP.              |
| **99.99% uptime guarantees**    | Cloudflare Pages provides sufficient reliability for a comparison site.       |

### What We're Keeping Non-Negotiable

| Requirement                      | Reason                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| **Price normalization accuracy** | Core value proposition. Must be <5% error vs actual pricing. |
| **Data freshness indicator**     | Users must know when data was last updated. Trust signal.    |
| **Mobile responsive**            | 40%+ traffic will be mobile.                                 |
| **SEO optimization**             | Organic search is primary acquisition channel.               |
| **Affiliate link tracking**      | Primary monetization. Must work correctly.                   |

---

## 4. Phase 1 Action Plan (MVP)

### Step 1: Data Foundation

1. Create Supabase schema (`proxyprice` namespace) with providers and pricing tables
2. Parse existing CSV data (`docs/Price.csv`) into normalized JSON format
3. Generate `providers.json` and `pricing.json` with pre-calculated $/GB metrics
4. Validate data quality: check for missing fields, outliers, format errors

### Step 2: Astro Frontend Setup

1. Initialize Astro project in `front/` directory
2. Configure Cloudflare Pages adapter
3. Import JSON data at build time
4. Create base layout with responsive navigation

### Step 3: Core Pages (Static HTML)

1. Homepage with featured comparison table
2. `/residential` - Residential proxy comparison
3. `/datacenter` - Datacenter proxy comparison
4. `/mobile` - Mobile proxy comparison
5. `/isp` - ISP proxy comparison

### Step 4: Comparison Table Component

1. Build sortable table (CSS-first approach)
2. Add proxy type filter (radio buttons + CSS)
3. Add price range filter (basic JS)
4. Include affiliate links with tracking

### Step 5: Provider Detail Pages

1. Generate `/provider/[slug]` pages at build time (SSG)
2. Pricing tier breakdown with visual chart
3. Feature matrix (pool size, geo coverage, protocols)
4. Direct affiliate link CTA

### Step 6: Price Calculator (Preact Island)

1. Build calculator component with Preact + Signals
2. Input: monthly bandwidth, proxy type, target countries
3. Output: ranked recommendations with monthly cost
4. Keep bundle under 10KB

### Step 7: SEO Foundation

1. Meta tags, Open Graph, JSON-LD schema
2. Sitemap generation
3. robots.txt configuration
4. Canonical URLs

### Step 8: Deployment

1. Configure Cloudflare Pages project
2. Set up GitHub Actions for CI/CD
3. Configure custom domain
4. Verify Lighthouse score (target: 95+)

### Step 9: Data Pipeline (Basic)

1. Create Python script for SOAX API scraping
2. Parse pricing pages, extract structured data
3. Generate updated JSON files
4. Manual trigger initially (automate in Phase 2)

### Step 10: Monitoring

1. Cloudflare Analytics for traffic
2. Error tracking (Sentry or similar)
3. Data freshness monitoring (simple health check)

---

## 5. Phase 2 Roadmap (Post-MVP Validation)

### Data Automation (Month 2)

- Automated weekly scraping via cron job
- Price change detection and alerts
- Dead letter queue for failed scrapes
- Manual review workflow for anomalies

### Enhanced Calculator (Month 2-3)

- Multi-provider comparison
- Usage scenario presets (sneaker botting, e-commerce scraping, etc.)
- Export comparison as PDF

### Community Features (Month 3-4)

- Provider review system (no auth, moderated submissions)
- "Report outdated pricing" button
- Provider claim/verification program

### API Access (Month 4+)

- Cloudflare Workers API for programmatic access
- Rate-limited free tier
- Premium tier for resellers/developers

### Expansion (Month 6+)

- CAPTCHA solver comparison
- Antidetect browser comparison
- Scraping tool comparison

---

## 6. Key Risks

### Risk 1: Pricing Data Goes Stale

**Probability**: High | **Impact**: High

**Mitigation**:

- Prominent "Last Updated" timestamp on every page
- Automated weekly scraping via SOAX API
- User-reported price changes (community crowdsourcing)
- Provider partnership program (direct data feed)

**Fallback**: If scraping fails consistently, display warning banner and revert to manual updates.

### Risk 2: Providers Block Scraping

**Probability**: Medium | **Impact**: High

**Mitigation**:

- Use SOAX residential proxies for scraping (ironic, but effective)
- Respect robots.txt and rate limits
- Offer "claim your listing" program with direct data submission
- Store cached versions of pricing pages

**Fallback**: Partner with willing providers first, use their data as anchor. Fill gaps with manual research.

### Risk 3: Price Normalization Fails for Complex Models

**Probability**: Medium | **Impact**: Medium

**Mitigation**:

- Start with per-GB providers only (80% of market)
- Flag non-normalizable pricing clearly: "Contact for quote"
- Usage calculator handles edge cases better than simple $/GB
- Document methodology transparently

**Fallback**: Show raw pricing with "not directly comparable" disclaimer for complex models.

---

## 7. Decision Points (User Input Required)

### Decision 1: Domain Name

- [ ] proxyprice.com (if available)
- [ ] proxyprices.com (alternative)
- [ ] compareproxies.com (alternative)
- [ ] Other user preference

### Decision 2: Initial Provider Scope

- [ ] Start with top 20 providers (faster MVP)
- [ ] Include all 50+ from existing CSV (comprehensive but more work)

### Decision 3: Affiliate Program Priority

- [ ] Research and implement affiliate links for MVP (potential revenue from day 1)
- [ ] Skip affiliates initially, add post-launch (faster MVP, delay revenue)

### Decision 4: Calculator Complexity

- [ ] Simple: bandwidth input only
- [ ] Medium: bandwidth + proxy type + basic geo
- [ ] Complex: full scenario builder with concurrent connections, target sites

### Decision 5: Data Update Frequency

- [ ] Weekly (sufficient for market)
- [ ] Daily (more fresh, higher SOAX costs ~$200-400/month)
- [ ] Manual only for MVP (lowest cost, highest maintenance)

---

## 8. Technical Reference

### Supabase Schema (Minimal for MVP)

```sql
-- Schema: proxyprice
CREATE SCHEMA IF NOT EXISTS proxyprice;

-- Providers table
CREATE TABLE IF NOT EXISTS proxyprice.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    website_url TEXT NOT NULL,
    affiliate_url TEXT,
    logo_url TEXT,
    trial_offer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pricing snapshots (immutable records)
CREATE TABLE IF NOT EXISTS proxyprice.pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES proxyprice.providers(id),
    proxy_type VARCHAR(50) NOT NULL,
    pricing_model VARCHAR(50) NOT NULL,
    tiers JSONB NOT NULL,
    min_price_per_gb DECIMAL(10,4),
    features JSONB DEFAULT '{}',
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'manual'
);

-- Indexes
CREATE INDEX idx_pricing_type_price ON proxyprice.pricing(proxy_type, min_price_per_gb);

-- Permissions
GRANT USAGE ON SCHEMA proxyprice TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA proxyprice TO postgres, anon, authenticated, service_role;
```

### Project Structure

```
proxyprice/
├── front/                      # Astro frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro
│   │   │   ├── residential.astro
│   │   │   ├── datacenter.astro
│   │   │   ├── calculator.astro
│   │   │   └── provider/[slug].astro
│   │   ├── components/
│   │   │   ├── ComparisonTable.astro
│   │   │   ├── Calculator.tsx       # Preact island
│   │   │   └── ProviderCard.astro
│   │   ├── data/
│   │   │   ├── providers.json
│   │   │   └── pricing.json
│   │   └── layouts/
│   │       └── BaseLayout.astro
│   ├── astro.config.mjs
│   └── package.json
├── backend/                    # Data pipeline
│   ├── scripts/
│   │   ├── parse_csv.py
│   │   ├── normalize.py
│   │   ├── scrape_prices.py
│   │   └── generate_json.py
│   └── requirements.txt
├── docs/
│   ├── Price.csv               # Source data
│   └── genesis/
│       ├── GENESIS.md          # This document
│       ├── PRD.md
│       ├── arch_performance.md
│       ├── arch_robustness.md
│       └── arch_simplicity.md
└── .github/
    └── workflows/
        └── deploy.yml
```

### SOAX API Integration

```python
# backend/scripts/scrape_prices.py

import requests

SOAX_API_KEY = "[REDACTED]"  # Use environment variable in production
SOAX_ENDPOINT = "https://scraping.soax.com/v1/webdata/fetch-content"

def scrape_pricing_page(url: str) -> str:
    response = requests.post(
        SOAX_ENDPOINT,
        headers={"Api-key": SOAX_API_KEY},
        json={
            "url": url,
            "format": "markdown",  # Easier to parse than HTML
            "timeout": 30
        }
    )
    response.raise_for_status()
    return response.json()["content"]
```

---

## 9. Success Metrics (MVP)

| Metric           | Target (Month 1) | Target (Month 3) |
| ---------------- | ---------------- | ---------------- |
| Unique Visitors  | 500              | 2,000            |
| Calculator Uses  | 100              | 500              |
| Affiliate Clicks | 25               | 100              |
| Time on Site     | >2 min           | >3 min           |
| Lighthouse Score | 95+              | 98+              |
| Data Freshness   | <14 days         | <7 days          |

---

## 10. Conclusion

This architecture balances the three perspectives:

- **From Performance**: Static-first approach, Astro islands, embedded JSON, edge caching
- **From Robustness**: Supabase for source of truth, immutable snapshots, graceful degradation
- **From Simplicity**: No runtime database, git-based deploys, junior-dev maintainable

The result is a fast, reliable, maintainable price comparison platform that can launch in 4 weeks and scale to 50K+ visitors without architectural changes.

**Next Step**: User confirms decision points (Section 7), then begin Phase 1 implementation.

---

_Document generated: 2025-12-27_
_Synthesis of: PRD.md + arch_performance.md + arch_robustness.md + arch_simplicity.md_
_Status: Ready for implementation_
