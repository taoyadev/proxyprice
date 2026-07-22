---
name: proxy-price-comparison
description: Compare public proxy pricing with ProxyPrice's normalized dataset and explain the limits of each comparison.
metadata:
  site: https://proxyprice.com
  data_last_updated: 2026-06-01
---

# ProxyPrice comparison

Use this skill when a user needs a transparent comparison of residential, datacenter, mobile, or ISP proxy prices.

## Reliable workflow

1. Start with the provider table or calculator at https://proxyprice.com.
2. In a WebMCP-capable browser, use the calculator's read-only `compare_proxy_prices` tool with whole-number `bandwidth_gb` (1-1000) and `proxy_type` (residential, datacenter, mobile, or isp).
3. Treat the displayed $/GB rate as comparable only when ProxyPrice labels the record comparable.
4. Open the provider page before making a recommendation; use the cited official sources to verify the plan.
5. State the dataset snapshot date (2026-06-01) and tell the user to confirm final provider terms.

## Boundaries

- Do not rank per-IP, per-proxy, per-thread, unlimited-bandwidth, or quote-only plans against $/GB plans.
- Do not present a lowest price as a performance, reliability, anonymity, or legal-compliance recommendation.
- Do not infer that a provider is available in a country or supports a use case unless the provider's official page says so.

## Structured data

The public candidate export is https://proxyprice.com/api/v1/export/proxy-merchant-intel-candidates.json. It contains only records with public pricing evidence and is described by https://proxyprice.com/openapi.json.
