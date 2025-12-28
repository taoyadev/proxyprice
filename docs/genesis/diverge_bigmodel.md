# ProxyPrice: Divergent Analysis

## Executive Summary

ProxyPrice positions itself as the "PCPartPicker for proxies" - a comparison and decision-support platform for the fragmented, opaque proxy services market. Unlike simple price tables, this platform must solve the fundamental problem that **proxy pricing is non-linear, use-case dependent, and intentionally confusing**.

---

## 1. User Personas

### Persona A: The Solo Scraper ("Indie Ian")

**Profile:**

- Solo developer or small agency running web scraping projects
- Budget: $50-500/month on proxies
- Technical skill: High (can integrate APIs)
- Pain tolerance for research: Low

**Pain Points:**

- Wasted hours comparing providers with incompatible pricing models
- "Got burned" by a provider with hidden bandwidth limits
- Needs different proxy types for different projects (residential for sneaker sites, datacenter for public APIs)
- Doesn't know if they're overpaying until they see a competitor's invoice

**Jobs to be Done:**

1. Find the cheapest residential proxy for <100GB/month
2. Verify a provider is legitimate before committing
3. Calculate true cost for their specific use case

**Quote:** "I just want to know: for my 50GB scraping job, who's actually cheapest?"

---

### Persona B: The Agency Buyer ("Procurement Paula")

**Profile:**

- Works at digital agency, SEO firm, or ad verification company
- Budget: $2,000-20,000/month
- Technical skill: Medium (relies on dev team for integration)
- Decision process: Committee approval required

**Pain Points:**

- Needs to justify vendor choice to management
- Scared of vendor lock-in with annual contracts
- Requires compliance documentation (GDPR, ethical sourcing)
- Current provider raised prices; needs alternatives fast

**Jobs to be Done:**

1. Generate comparison report for procurement team
2. Find enterprise-grade providers with SLAs
3. Negotiate better rates with current provider using market data

**Quote:** "I need a PDF I can attach to the purchase request that shows we picked the best value."

---

### Persona C: The Technical Evaluator ("DevOps Derek")

**Profile:**

- Senior engineer at company with proxy infrastructure
- Responsible for reliability, not just cost
- Budget: Allocated by finance, wants efficiency
- Technical skill: Very high

**Pain Points:**

- API documentation varies wildly between providers
- Needs to test latency, success rates, geo-distribution
- Integration complexity differs (some need SDKs, some are standard HTTP)
- Monitoring and alerting capabilities vary

**Jobs to be Done:**

1. Compare technical specifications (IP pool size, rotation options, protocol support)
2. Find providers with specific geo-locations
3. Evaluate API design quality before committing

**Quote:** "I don't care about the cheapest. I care about the one that won't wake me up at 3 AM."

---

## 2. Core Features (MVP Scope)

### The Minimum Viable Comparison Engine

**2.1 Smart Price Calculator**

- Input: Use case parameters (GB/month, concurrent connections, countries needed, proxy type)
- Output: Ranked list of providers with **normalized monthly cost**
- Killer feature: "Per-request cost" calculation for apples-to-apples comparison

```
User inputs:
- Proxy type: Residential
- Monthly bandwidth: 100 GB
- Target countries: US, UK, Germany
- Concurrent connections: 50

Output:
| Provider    | Monthly Cost | Per GB   | Per 1K Requests* |
|-------------|--------------|----------|------------------|
| Bright Data | $500         | $5.00    | $0.15            |
| Oxylabs     | $480         | $4.80    | $0.14            |
| SOAX        | $299         | $2.99    | $0.09            |

*Estimated based on average page size of 2MB
```

**2.2 Provider Database**

- 50+ providers at launch
- Structured data: Pricing tiers, proxy types, pool sizes, locations, protocols
- Unstructured data: Review snippets, changelog of price updates
- Trust signals: Verification status, last updated date

**2.3 Filterable Comparison Table**

- Filter by: Proxy type, price range, location coverage, minimum pool size
- Sort by: Price per GB, total cost, user rating, pool size
- Columns: Provider, Type, Price, Locations, Pool Size, Rating, Last Updated

**2.4 Provider Detail Pages**

- SEO-optimized landing pages for each provider
- Pricing breakdown by tier
- Feature matrix
- User reviews (phase 2) or aggregated external reviews
- "Similar providers" recommendations

**2.5 Price Alerts (Email)**

- Simple: "Notify me when residential proxies under $3/GB are available"
- Tracks provider price changes via automated scraping

### Technical MVP Stack

```
Frontend: SvelteKit on Cloudflare Pages
Backend: Supabase (Postgres + Auth + Edge Functions)
Data Pipeline: SOAX Scraping API -> Edge Function -> Supabase
Caching: Cloudflare KV for price data
```

---

## 3. Extended Features (V2 Roadmap)

### Phase 2: Community & Trust Layer

**3.1 User Reviews & Ratings**

- Verified purchase reviews (connect via provider API or manual verification)
- Rating dimensions: Speed, Reliability, Support, Value
- "Would recommend for: [use case tags]"

**3.2 Provider Verification Program**

- Providers can claim their listing
- Submit official pricing, respond to reviews
- "Verified Partner" badge (and revenue opportunity)

**3.3 Success Rate Benchmarks**

- Community-contributed success rates by target site
- "How well does Provider X work on Amazon/Google/Zillow?"
- Anonymized, aggregated data

### Phase 3: Platform Evolution

**3.4 Proxy Testing Tool**

- User inputs their proxy credentials
- We test: Latency, success rate, IP uniqueness, geo-accuracy
- Benchmark against our database

**3.5 Usage Analytics Dashboard**

- For users with multiple providers
- Aggregate spending, usage patterns, cost optimization suggestions
- "You could save 23% by moving 40% of your US traffic to Provider Y"

**3.6 Contract Negotiation Intel**

- Crowdsourced discount data
- "Users report getting 15% off with annual commitment"
- Enterprise tier: Negotiation playbooks

**3.7 API for Price Data**

- Developers can query current pricing programmatically
- Freemium model: 100 requests/day free, paid tiers for more
- Use case: Build proxy rotation logic that considers cost

### Phase 4: Marketplace Dynamics

**3.8 Request for Proposal (RFP) System**

- Large buyers post requirements
- Providers bid for the contract
- ProxyPrice takes cut of successful matches

**3.9 Proxy Aggregator/Reseller**

- Actually sell proxy access through ProxyPrice
- Abstract away the complexity for users
- Significant revenue but also significant liability

**3.10 Educational Content Hub**

- "How to choose a proxy" guides
- Use case playbooks (scraping, ad verification, sneaker bots)
- SEO traffic driver

---

## 4. Monetization

### Revenue Model Tiers

**Tier 1: Affiliate Revenue (Day 1)**

- Commission on signups via affiliate links
- Typical: 10-30% of first month, or $50-200 per signup
- Estimated: $50 average per conversion
- Break-even: 100 conversions/month = $5,000/month

**Tier 2: Sponsored Listings (Month 3+)**

- "Featured Provider" placement in search results
- Provider profile upgrades (video, custom branding)
- Pricing: $500-2,000/month per provider
- 10 sponsors = $5,000-20,000/month

**Tier 3: Lead Generation (Month 6+)**

- Sell qualified leads to providers
- User submits requirements, matched to relevant providers
- Pricing: $20-100 per qualified lead
- High intent = high value

**Tier 4: Premium Tools (Month 9+)**

- Pro accounts: Advanced calculators, export to PDF, saved comparisons
- Pricing: $29-99/month
- Target: Agency buyers, procurement teams

**Tier 5: Data & API (Year 2+)**

- Market intelligence reports
- API access to pricing data
- Pricing: $199-999/month
- Target: Providers wanting competitive intel, investors

### Revenue Projection (Conservative)

| Month | Affiliate | Sponsors | Leads   | Premium | Total   |
| ----- | --------- | -------- | ------- | ------- | ------- |
| 3     | $2,000    | $500     | -       | -       | $2,500  |
| 6     | $5,000    | $3,000   | $1,000  | -       | $9,000  |
| 12    | $10,000   | $10,000  | $5,000  | $2,000  | $27,000 |
| 24    | $15,000   | $20,000  | $10,000 | $10,000 | $55,000 |

---

## 5. Competitive Landscape

### Direct Competitors

**5.1 Proxy comparison sites (low quality)**

- proxyway.com - Reviews, but limited comparison tools
- bestproxyproviders.com - Affiliate-focused, biased rankings
- proxyscrape.com - Free proxy lists, different market

**Weakness:** All are content sites, not tools. No calculators, no real-time data.

**5.2 Review aggregators**

- G2, Capterra - General software reviews, limited proxy coverage
- TrustRadius - Enterprise focus, few proxy providers listed

**Weakness:** Not specialized. No pricing comparison.

**5.3 Provider marketing sites**

- Bright Data's "comparison" pages
- Oxylabs competitive analyses

**Weakness:** Obviously biased. Users don't trust them.

### Indirect Competitors

**5.4 Reddit / Discord communities**

- r/webscraping, proxy-focused Discords
- Real user experiences, but unstructured

**Opportunity:** Aggregate and structure this knowledge

**5.5 Direct provider websites**

- Users compare manually by visiting 5-10 sites
- Painful, time-consuming

**Opportunity:** Be the single source of truth

### Competitive Differentiation

| Factor              | ProxyPrice                     | Competitors           |
| ------------------- | ------------------------------ | --------------------- |
| Real-time pricing   | Yes (automated)                | No (manual updates)   |
| Use-case calculator | Yes                            | No                    |
| Unbiased            | Yes (transparent monetization) | No (hidden affiliate) |
| Technical depth     | Yes (API docs, specs)          | No (marketing fluff)  |
| Price alerts        | Yes                            | No                    |
| User reviews        | Yes (verified)                 | Maybe (unverified)    |

---

## 6. Critical Questions

### Must Be True for Success

**6.1 Data Accuracy**

> "Can we keep pricing data accurate within 48 hours of provider changes?"

- Risk: Stale data destroys trust
- Mitigation: Automated scraping + provider partnerships + user reports
- Test: Manually verify 10 providers weekly in MVP phase

**6.2 User Trust**

> "Will users trust a comparison site that makes money from affiliates?"

- Risk: Perceived bias undermines value
- Mitigation: Transparent monetization, show all providers equally, editorially independent
- Test: Survey early users on trust perception

**6.3 SEO Viability**

> "Can we rank for 'best residential proxies' against established sites?"

- Risk: No organic traffic = paid acquisition only = unsustainable
- Mitigation: Long-tail keywords first, tool-based content (calculators), unique data
- Test: Rank for 5 long-tail keywords in 90 days

**6.4 Provider Cooperation**

> "Will providers engage with the platform?"

- Risk: Providers ignore or actively obstruct
- Mitigation: Offer value (verified listings, lead gen), start with friendly providers
- Test: Get 5 providers to claim listings in 60 days

**6.5 Market Size**

> "Is the proxy market large enough to support a comparison business?"

- Market size: ~$3B globally, growing 10%+ annually
- Buyers: Thousands of companies, tens of thousands of individuals
- Risk: Niche might be too small
- Mitigation: Expand to adjacent markets (VPNs, CAPTCHA solvers, scraping tools)

**6.6 Pricing Complexity**

> "Can we normalize fundamentally different pricing models?"

- Challenge: Per-GB vs per-IP vs per-thread vs per-request
- Risk: Oversimplification misleads users
- Mitigation: Show raw pricing AND normalized estimates, clear methodology disclosure
- Test: User testing with 10 target users

---

## 7. Expansion Vectors

### Adjacent Markets (Post-Traction)

1. **CAPTCHA Solving Services** - Same buyers, similar comparison needs
2. **Web Scraping APIs** - ScrapingBee, Apify, etc.
3. **Headless Browsers** - Browserless, Playwright services
4. **VPN Services** - Consumer and business
5. **Anti-Detect Browsers** - Multilogin, GoLogin
6. **Data Extraction Services** - Broader than proxies

### The Platform Play

Ultimate vision: **"The infrastructure layer for web data extraction"**

```
ProxyPrice starts as: Proxy comparison
Becomes: Data infrastructure marketplace
Includes: Proxies + Scrapers + CAPTCHAs + Browsers + APIs
Offers: Comparison + Reviews + Testing + Aggregation + Consulting
```

---

## 8. Risks & Mitigations

| Risk                                   | Likelihood | Impact | Mitigation                                             |
| -------------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| Data goes stale                        | High       | High   | Automated scraping, provider API integrations          |
| Providers refuse to engage             | Medium     | Medium | Start with small/hungry providers, prove traffic value |
| SEO competition too strong             | Medium     | High   | Focus on tool-based content, unique data               |
| Legal challenges (scraping pricing)    | Low        | High   | Public data only, robots.txt compliance                |
| Affiliate revenue dries up             | Medium     | Medium | Diversify to sponsors, leads, premium                  |
| Market consolidation (fewer providers) | Low        | Medium | Expand to adjacent markets                             |

---

## 9. 90-Day Roadmap

### Days 1-30: Foundation

- [ ] Data structure design in Supabase
- [ ] Import existing CSV data
- [ ] Build basic comparison table UI
- [ ] Set up SOAX scraping for top 10 providers

### Days 31-60: MVP Launch

- [ ] Price calculator feature
- [ ] Provider detail pages
- [ ] Basic SEO setup (meta, sitemap)
- [ ] Soft launch to Reddit/Discord communities

### Days 61-90: Validation

- [ ] Track conversions via affiliate links
- [ ] Collect user feedback
- [ ] Iterate on calculator based on usage
- [ ] Approach 5 providers for partnerships

---

## 10. Success Metrics

### North Star Metric

**Monthly affiliate revenue** (direct validation of user value + commercial viability)

### Supporting Metrics

| Metric                      | Target (90 days) | Target (1 year) |
| --------------------------- | ---------------- | --------------- |
| Monthly unique visitors     | 5,000            | 50,000          |
| Calculator uses/month       | 1,000            | 20,000          |
| Affiliate conversions/month | 20               | 200             |
| Provider listings           | 50               | 150             |
| Email subscribers           | 500              | 10,000          |

---

## Conclusion

ProxyPrice addresses a genuine market gap: proxy pricing is intentionally confusing, and buyers waste hours on manual research. The diskprices.com model proves that price comparison in technical niches can work.

**Key success factors:**

1. Data accuracy and freshness (automated scraping is the moat)
2. Calculator that handles pricing complexity (the killer feature)
3. Trust through transparency (show methodology, disclose monetization)
4. SEO execution (long-tail first, tools as content)

**The big question:**
Can we execute on automated pricing data better than anyone else?

If yes, the market is waiting.

---

_Generated: 2024-12-27_
_Model: Claude Opus 4.5_
_Status: Divergent exploration phase_
