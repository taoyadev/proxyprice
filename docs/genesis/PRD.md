# ProxyPrice - Product Requirements Document

## 1. Product Vision

ProxyPrice is the definitive price comparison and decision-making platform for proxy services - the "diskprices.com for proxies." In a market where pricing is intentionally complex (per-GB, per-IP, per-thread, tiered, with hidden fees), ProxyPrice provides transparent, normalized comparisons that help users find the right proxy provider for their specific use case. By combining automated data collection, intelligent price normalization, and use-case matching, we transform hours of manual research into seconds of clarity.

---

## 2. Target Users (Consolidated Personas)

### Primary Persona: The Solo Scraper ("Indie Ian")

- **Profile**: Solo developer or small team running web scraping projects
- **Budget**: $50-500/month on proxies
- **Pain**: Wastes hours comparing incompatible pricing models; got burned by hidden limits
- **Job**: Find the cheapest working proxy for their specific use case and usage level
- **Quote**: "For my 50GB scraping job, who's actually cheapest?"

### Secondary Persona: The Enterprise Buyer ("Procurement Paula")

- **Profile**: Works at agency/enterprise with compliance requirements
- **Budget**: $2,000-20,000/month
- **Pain**: Needs to justify vendor choices to management; requires comparison reports
- **Job**: Create defensible vendor comparisons; negotiate better rates with market data
- **Quote**: "I need a PDF that shows we picked the best value."

### Tertiary Persona: The Technical Evaluator ("DevOps Derek")

- **Profile**: Senior engineer responsible for proxy infrastructure reliability
- **Budget**: Allocated by finance
- **Pain**: API quality varies wildly; needs to evaluate technical specs, not just price
- **Job**: Find providers that won't cause 3 AM outages; compare technical specifications
- **Quote**: "I don't care about cheapest. I care about what won't break."

---

## 3. MVP Features (Prioritized)

### P0: Core Comparison Engine

| Feature                | Description                                           | Success Criteria             |
| ---------------------- | ----------------------------------------------------- | ---------------------------- |
| **Provider Database**  | 50+ providers with structured pricing data            | All major providers included |
| **Normalized Pricing** | Convert all pricing models to comparable $/GB metrics | <5% calculation error rate   |
| **Proxy Type Filters** | Residential, Datacenter, Mobile, ISP                  | All types filterable         |
| **Sortable Table**     | Sort by price, provider, pool size                    | Sub-100ms sort time          |
| **Price Calculator**   | Input usage parameters, get ranked recommendations    | 1,000+ uses/month            |

### P1: Data Freshness Layer

| Feature                  | Description                           | Success Criteria          |
| ------------------------ | ------------------------------------- | ------------------------- |
| **Automated Scraping**   | SOAX API fetches pricing pages weekly | <7 day data freshness     |
| **Last Updated Display** | Show freshness indicator per provider | 100% coverage             |
| **Change Detection**     | Track price changes over time         | Historical data available |

### P2: Provider Detail Pages

| Feature               | Description                        | Success Criteria          |
| --------------------- | ---------------------------------- | ------------------------- |
| **Provider Profiles** | Dedicated SEO-optimized pages      | Indexed by Google         |
| **Pricing Breakdown** | Visual tier breakdown              | User comprehension >80%   |
| **Feature Matrix**    | Pool size, geo coverage, protocols | 10+ features per provider |

---

## 4. Success Metrics

### North Star Metric

**Monthly Affiliate Revenue** - Direct validation of user value and commercial viability

### Leading Indicators

| Metric            | Month 1 | Month 3 | Month 6 | Month 12 |
| ----------------- | ------- | ------- | ------- | -------- |
| Unique Visitors   | 500     | 2,000   | 5,000   | 20,000   |
| Calculator Uses   | 100     | 500     | 2,000   | 10,000   |
| Affiliate Clicks  | 50      | 200     | 500     | 2,500    |
| Provider Profiles | 25      | 50      | 75      | 100      |
| Email Subscribers | 50      | 200     | 500     | 2,000    |

### Quality Indicators

- Data freshness: <7 days for top 20 providers
- User return rate: >20%
- Time on site: >3 minutes
- Calculator accuracy: <5% variance vs actual pricing

---

## 5. Open Questions

### Technical

1. How do we normalize per-thread and per-port pricing to $/GB?
2. What is the optimal scraping frequency (daily vs weekly)?
3. How do we handle custom/enterprise pricing that requires sales calls?

### Business

1. Which providers have affiliate programs and at what commission rates?
2. Will providers cooperate with listing or resist with legal/technical measures?
3. Can SEO alone drive sufficient traffic, or do we need paid acquisition?

### Product

1. Should MVP include user reviews or defer to V2?
2. How much pricing complexity is acceptable before users abandon?
3. Which proxy types should be prioritized for launch?

---

## 6. Out of Scope for MVP

- User accounts / authentication
- User reviews and ratings
- Provider claiming/verification
- API access for developers
- Mobile app
- Benchmark testing data
- Price alerts / notifications
- Premium paid features

---

## 7. Risks

| Risk                             | Probability | Impact | Mitigation                                            |
| -------------------------------- | ----------- | ------ | ----------------------------------------------------- |
| Pricing data goes stale          | High        | High   | Automated scraping + provider partnerships            |
| Providers block scraping         | Medium      | High   | SOAX API, diversify sources, offer value to providers |
| SEO competition too strong       | Medium      | Medium | Long-tail keywords, tool-based content                |
| Affiliate revenue insufficient   | Medium      | Medium | Diversify to sponsors, leads, premium                 |
| Pricing too complex to normalize | Low         | High   | Start simple, iterate based on feedback               |

---

_Document synthesized from three independent analyses_
_Status: Ready for architecture phase_
