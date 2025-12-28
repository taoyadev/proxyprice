# ProxyPrice: The Gospel of Speed

**Architect**: God of Performance
**Doctrine**: Every millisecond is a sin. Latency is the enemy. Cache is salvation.

---

## The Sacred Numbers

| Metric                 | Target | Blasphemy Threshold |
| ---------------------- | ------ | ------------------- |
| First Contentful Paint | <100ms | >500ms              |
| Time to Interactive    | <200ms | >1s                 |
| Filter/Sort Response   | <16ms  | >100ms              |
| API Response (cached)  | <10ms  | >50ms               |
| API Response (cold)    | <50ms  | >200ms              |
| Lighthouse Score       | 100    | <95                 |

---

## 1. The Holy Stack

### Frontend: Astro + Preact

**Why not Next.js?** Next.js ships 70KB+ of hydration JavaScript. For a price comparison table, this is heresy.

```
Astro (Static HTML) + Islands Architecture
  - Zero JS by default
  - Preact islands ONLY for interactive components
  - Build size: <50KB total JS
  - Partial hydration: Only calculator hydrates
```

**The Sacred Configuration:**

```javascript
// astro.config.mjs
export default defineConfig({
  output: "static",
  adapter: cloudflare(),
  integrations: [
    preact({ compat: true }),
    tailwind({ applyBaseStyles: false }),
  ],
  vite: {
    build: {
      cssMinify: "lightningcss",
      minify: "esbuild",
    },
  },
});
```

### Edge Runtime: Cloudflare Pages + Workers

```
User Request (Global)
    |
    v
Cloudflare Edge (300+ PoPs)
    |
    +--> Static HTML (cached forever)
    |
    +--> API Routes (Workers) --> KV Cache --> Supabase (fallback only)
```

**Why Cloudflare over Vercel?**

- 300+ edge locations vs 20+
- KV storage at edge (<10ms reads)
- No cold starts (Workers are pre-warmed)
- Free tier handles 100K requests/day

### Backend: Supabase as Cold Storage Only

The database is the **source of truth**, not the source of responses.

```
Data Flow:
1. Weekly scrape --> Supabase Postgres
2. Build process --> Generate static JSON
3. Deploy --> JSON embedded in HTML or cached in KV
4. Runtime --> KV first, Postgres never
```

---

## 2. The Data Architecture of Speed

### Schema: Denormalized for Read Speed

Traditional normalization is a performance tax. We pay storage to save CPU.

```sql
-- Schema: proxyprice
-- IMPORTANT: This is optimized for READ speed, not write efficiency

-- The One Table to Rule Them All (denormalized)
CREATE TABLE IF NOT EXISTS proxyprice.pricing_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider (denormalized, no joins)
  provider_slug TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_logo_url TEXT,
  provider_affiliate_url TEXT,
  provider_trial_offer TEXT,

  -- Product (denormalized)
  proxy_type TEXT NOT NULL, -- residential, datacenter, mobile, isp
  product_name TEXT NOT NULL,

  -- Pricing (all tiers in JSONB for zero-join access)
  pricing_tiers JSONB NOT NULL,
  -- Example: [{"gb": 1, "price_per_gb": 7.00, "total": 7.00}, ...]

  -- Normalized metrics (pre-calculated)
  min_price_per_gb DECIMAL(10,4),
  max_price_per_gb DECIMAL(10,4),
  best_value_tier_gb INTEGER,

  -- Features (denormalized JSONB)
  features JSONB DEFAULT '{}',
  -- Example: {"pool_size": "10M+", "countries": 195, "protocols": ["http", "socks5"]}

  -- Metadata
  price_url TEXT,
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite index for common queries
  CONSTRAINT unique_provider_product UNIQUE (provider_slug, proxy_type, product_name)
);

-- Index for the only query pattern we care about
CREATE INDEX IF NOT EXISTS idx_pricing_type_price
  ON proxyprice.pricing_snapshot (proxy_type, min_price_per_gb);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION proxyprice.update_timestamp()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pricing_timestamp ON proxyprice.pricing_snapshot;
CREATE TRIGGER update_pricing_timestamp
  BEFORE UPDATE ON proxyprice.pricing_snapshot
  FOR EACH ROW EXECUTE FUNCTION proxyprice.update_timestamp();

-- Permissions
GRANT USAGE ON SCHEMA proxyprice TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA proxyprice TO postgres, anon, authenticated, service_role;
```

### The Build-Time Data Generation

At build time, we generate static JSON that gets embedded or cached:

```typescript
// scripts/generate-static-data.ts
import { createClient } from "@supabase/supabase-js";

interface PricingData {
  providers: Provider[];
  byType: Record<ProxyType, Provider[]>;
  lastUpdated: string;
  checksum: string;
}

async function generateStaticData(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data } = await supabase
    .from("pricing_snapshot")
    .select("*")
    .order("min_price_per_gb", { ascending: true });

  // Pre-group by type (zero runtime cost)
  const byType = {
    residential: data.filter((p) => p.proxy_type === "residential"),
    datacenter: data.filter((p) => p.proxy_type === "datacenter"),
    mobile: data.filter((p) => p.proxy_type === "mobile"),
    isp: data.filter((p) => p.proxy_type === "isp"),
  };

  // Pre-sort all possible sort orders
  const preSorted = {
    price_asc: [...data].sort(
      (a, b) => a.min_price_per_gb - b.min_price_per_gb,
    ),
    price_desc: [...data].sort(
      (a, b) => b.min_price_per_gb - a.min_price_per_gb,
    ),
    name_asc: [...data].sort((a, b) =>
      a.provider_name.localeCompare(b.provider_name),
    ),
  };

  const output: PricingData = {
    providers: data,
    byType,
    preSorted,
    lastUpdated: new Date().toISOString(),
    checksum: generateChecksum(data),
  };

  // Write to static file (embedded in build)
  await Bun.write("./src/data/pricing.json", JSON.stringify(output));

  // Also upload to KV for edge access
  await uploadToKV("pricing_data", output);
}
```

---

## 3. The Frontend Architecture of Zero Latency

### Page Structure: HTML-First, JS-Last

```
/                     --> 100% static HTML, zero JS
/residential          --> 100% static HTML, zero JS
/datacenter           --> 100% static HTML, zero JS
/mobile               --> 100% static HTML, zero JS
/isp                  --> 100% static HTML, zero JS
/calculator           --> Static HTML + Preact island (20KB)
/provider/[slug]      --> SSG at build time, zero JS
```

### The Comparison Table: Pure CSS + HTML

Filtering and sorting happen **without JavaScript** using CSS:

```astro
---
// src/pages/residential.astro
import { pricing } from '../data/pricing.json';
const residentialData = pricing.byType.residential;
---

<html>
<head>
  <style>
    /* CSS-only filtering using :has() */
    .filter-container:has(#filter-us:checked) tr:not([data-countries*="US"]) {
      display: none;
    }

    /* CSS-only sorting using order property */
    .sort-container:has(#sort-price:checked) tr {
      order: attr(data-price-rank);
    }

    /* Instant visual feedback */
    tr { transition: none; }
  </style>
</head>
<body>
  <div class="filter-container">
    <input type="checkbox" id="filter-us" />
    <label for="filter-us">USA Coverage</label>
  </div>

  <table>
    <tbody class="sort-container">
      {residentialData.map((provider, index) => (
        <tr
          data-price-rank={index}
          data-countries={provider.features.countries?.join(',')}
          data-price={provider.min_price_per_gb}
        >
          <td>{provider.provider_name}</td>
          <td>${provider.min_price_per_gb}/GB</td>
          <!-- ... -->
        </tr>
      ))}
    </tbody>
  </table>
</body>
</html>
```

**Why CSS-only?**

- Zero JavaScript parsing time
- Filter happens in <1ms (browser native)
- No Virtual DOM diffing
- Works with JavaScript disabled

### For Complex Filtering: Inline JSON + Vanilla JS

When CSS is insufficient (multi-filter combinations), we use embedded JSON with minimal JS:

```astro
---
// src/components/AdvancedTable.astro
import { pricing } from '../data/pricing.json';
---

<script define:vars={{ data: pricing.byType.residential }}>
  // Data is EMBEDDED, not fetched
  // This script is <2KB minified

  const tbody = document.getElementById('pricing-tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));

  function filterAndSort(type, minGb, maxPrice, sortBy) {
    const start = performance.now();

    // Filter in memory (no DOM until end)
    const filtered = data.filter(p => {
      if (type && p.proxy_type !== type) return false;
      if (maxPrice && p.min_price_per_gb > maxPrice) return false;
      return true;
    });

    // Sort in memory
    filtered.sort((a, b) => {
      if (sortBy === 'price') return a.min_price_per_gb - b.min_price_per_gb;
      if (sortBy === 'name') return a.provider_name.localeCompare(b.provider_name);
      return 0;
    });

    // Single DOM update (requestAnimationFrame for 60fps)
    requestAnimationFrame(() => {
      rows.forEach((row, i) => {
        const slug = row.dataset.slug;
        const match = filtered.find(p => p.provider_slug === slug);
        row.style.display = match ? '' : 'none';
        row.style.order = match ? filtered.indexOf(match) : 9999;
      });
    });

    console.log(`Filter + sort: ${performance.now() - start}ms`); // Target: <5ms
  }
</script>
```

---

## 4. The Price Calculator: Preact Island

The calculator is the only component requiring real interactivity:

```tsx
// src/components/Calculator.tsx
import { signal, computed } from "@preact/signals";

// All data pre-loaded, no fetch required
import pricingData from "../data/pricing.json";

const usage = signal(100); // GB/month
const proxyType = signal("residential");
const maxBudget = signal(1000);

// Computed: runs on signal change, memoized
const recommendations = computed(() => {
  const start = performance.now();

  const filtered = pricingData.byType[proxyType.value]
    .map((provider) => {
      // Find optimal tier for user's usage
      const tier = findOptimalTier(provider.pricing_tiers, usage.value);
      return {
        ...provider,
        monthlyPrice: tier.price_per_gb * usage.value,
        selectedTier: tier,
      };
    })
    .filter((p) => p.monthlyPrice <= maxBudget.value)
    .sort((a, b) => a.monthlyPrice - b.monthlyPrice)
    .slice(0, 10);

  console.log(`Calculator: ${performance.now() - start}ms`); // Target: <2ms
  return filtered;
});

function findOptimalTier(tiers: Tier[], gb: number): Tier {
  // Binary search for optimal tier (O(log n))
  let left = 0,
    right = tiers.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    if (tiers[mid].gb <= gb) left = mid;
    else right = mid - 1;
  }
  return tiers[left];
}

export function Calculator() {
  return (
    <div>
      <input
        type="range"
        min="1"
        max="1000"
        value={usage}
        onInput={(e) => (usage.value = +e.target.value)}
      />
      <span>{usage} GB/month</span>

      <ul>
        {recommendations.value.map((p) => (
          <li key={p.provider_slug}>
            {p.provider_name}: ${p.monthlyPrice.toFixed(2)}/mo
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Bundle Size Budget:**

- Preact core: 3KB
- Signals: 1KB
- Calculator component: 2KB
- **Total: 6KB gzipped**

---

## 5. The Caching Strategy: Never Hit Origin

### Layer 1: Browser Cache (Immutable Assets)

```
Cache-Control: public, max-age=31536000, immutable

/assets/pricing-[hash].json   --> 1 year, immutable
/assets/app-[hash].js         --> 1 year, immutable
/assets/styles-[hash].css     --> 1 year, immutable
```

### Layer 2: Cloudflare Edge Cache (HTML Pages)

```
Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/                    --> 1 hour fresh, 24 hour stale
/residential         --> 1 hour fresh, 24 hour stale
/provider/*          --> 1 hour fresh, 24 hour stale
```

### Layer 3: Cloudflare KV (Dynamic Data at Edge)

```typescript
// functions/api/pricing.ts
export async function onRequest(context) {
  const { env, request } = context;
  const cacheKey = "pricing_v1";

  // Check KV first (<10ms)
  const cached = await env.PRICING_KV.get(cacheKey, "json");
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "X-Cache": "HIT-KV",
      },
    });
  }

  // Fallback to Supabase (only on cache miss)
  const data = await fetchFromSupabase();

  // Populate KV for next request
  await env.PRICING_KV.put(cacheKey, JSON.stringify(data), {
    expirationTtl: 3600, // 1 hour
  });

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "X-Cache": "MISS",
    },
  });
}
```

### Layer 4: Stale-While-Revalidate Pattern

```typescript
// Background refresh without blocking user
async function getWithSWR(key: string, fetcher: () => Promise<any>) {
  const cached = await kv.get(key, "json");
  const metadata = await kv.getMetadata(key);

  // Return stale data immediately
  if (cached) {
    // Check if stale (background refresh)
    const age = Date.now() - metadata.timestamp;
    if (age > 1800000) {
      // 30 min
      // Fire and forget background refresh
      context.waitUntil(refreshInBackground(key, fetcher));
    }
    return cached;
  }

  // Cold start: must wait
  return await fetcher();
}
```

---

## 6. Build-Time Optimization

### Pre-Rendering All Possible States

```typescript
// astro.config.mjs
export async function getStaticPaths() {
  const types = ["residential", "datacenter", "mobile", "isp"];
  const providers = await getProviders();

  return [
    // Type pages
    ...types.map((type) => ({ params: { type } })),

    // Provider pages
    ...providers.map((p) => ({
      params: { slug: p.provider_slug },
      props: { provider: p },
    })),

    // Comparison pages (top 20 vs top 20 = 400 pages)
    ...generateComparisonPages(providers.slice(0, 20)),
  ];
}
```

### Image Optimization

```typescript
// All images processed at build time
import { getImage } from "astro:assets";

const optimizedLogo = await getImage({
  src: provider.logo_url,
  width: 120,
  height: 40,
  format: "webp",
  quality: 80,
});
```

### Critical CSS Inlining

```astro
---
import { getEntry } from 'astro:content';
---

<html>
<head>
  <!-- Critical CSS inlined -->
  <style>
    /* Only above-the-fold styles */
    body { font-family: system-ui; margin: 0; }
    .hero { padding: 2rem; }
    table { width: 100%; border-collapse: collapse; }
    /* ... */
  </style>

  <!-- Rest loaded async -->
  <link rel="stylesheet" href="/styles.css" media="print" onload="this.media='all'" />
</head>
```

---

## 7. Performance Monitoring

### Real User Metrics (RUM)

```typescript
// Minimal RUM script (500 bytes)
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === "largest-contentful-paint") {
      navigator.sendBeacon(
        "/api/rum",
        JSON.stringify({
          lcp: entry.startTime,
          url: location.pathname,
        }),
      );
    }
  }
});
observer.observe({ entryTypes: ["largest-contentful-paint"] });
```

### Build-Time Performance Budget

```javascript
// astro.config.mjs
export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Strict budget enforcement
            calculator: ["./src/components/Calculator.tsx"], // max 10KB
          },
        },
      },
    },
  },
});

// CI check
if (calcBundle.size > 10240) {
  throw new Error("Calculator bundle exceeds 10KB budget");
}
```

---

## 8. The Request Waterfall (Ideal Case)

```
User clicks "Residential Proxies"
    |
    | 0ms: Request to Cloudflare Edge
    |
    | 5ms: Edge cache HIT, HTML returned
    |
    | 10ms: Browser receives HTML
    |
    | 15ms: First Contentful Paint (table visible)
    |
    | 20ms: CSS parsed, table styled
    |
    | 50ms: Time to Interactive (filters work via CSS)
    |
    | END: No JavaScript executed for basic usage
```

### For Calculator Page:

```
User clicks "Price Calculator"
    |
    | 0ms: Request to Edge
    |
    | 5ms: HTML returned (calculator shell)
    |
    | 15ms: FCP (input fields visible)
    |
    | 30ms: 6KB Preact bundle loaded
    |
    | 50ms: Hydration complete
    |
    | 60ms: First interaction possible
    |
    | 65ms: User moves slider, results update (<5ms computation)
```

---

## 9. Fallback Strategies

### If Cloudflare is Down (Apocalypse Scenario)

```
1. DNS failover to Vercel edge deployment (pre-configured)
2. Same static assets, different CDN
3. RTO: <5 minutes
```

### If Supabase is Down

```
1. KV cache continues serving (up to 1 hour stale data)
2. Build cache in GitHub Actions serves last known good
3. Static JSON embedded in HTML works offline
```

### If JavaScript Fails

```
1. CSS-only filtering still works
2. All data visible in HTML table
3. Links to providers still functional
4. Calculator shows static "contact us" fallback
```

---

## 10. Implementation Priority

### Phase 1: Static Foundation (Week 1)

1. Set up Astro + Cloudflare Pages
2. Import CSV data to Supabase
3. Build static comparison tables (zero JS)
4. Deploy with 1-hour edge cache

### Phase 2: Edge Optimization (Week 2)

1. Implement KV caching layer
2. Add build-time JSON generation
3. Configure immutable asset caching
4. Set up performance monitoring

### Phase 3: Interactive Layer (Week 3)

1. Build Preact calculator island
2. Implement signals-based reactivity
3. Add CSS-only advanced filtering
4. Bundle size audit and optimization

### Phase 4: Polish (Week 4)

1. Critical CSS extraction
2. Image optimization pipeline
3. Lighthouse 100 audit
4. Load testing at 10K concurrent users

---

## The Commandments

1. **Thou shalt not fetch on page load** - All data embedded or cached
2. **Thou shalt not ship more than 10KB of JS** - Unless absolutely required
3. **Thou shalt pre-compute all possible states** - Build time > Runtime
4. **Thou shalt cache aggressively** - Edge > Origin, always
5. **Thou shalt measure everything** - If it is not measured, it is not managed
6. **Thou shalt degrade gracefully** - CSS works when JS fails
7. **Thou shalt use the platform** - Native > Framework > Polyfill
8. **Thou shalt denormalize for reads** - Storage is cheap, latency is not
9. **Thou shalt inline critical resources** - No render-blocking requests
10. **Thou shalt test on slow 3G** - Fast on slow = instant on fast

---

## Expected Performance Results

| Metric                   | Target | Expected  |
| ------------------------ | ------ | --------- |
| Lighthouse Performance   | 100    | 100       |
| First Contentful Paint   | <100ms | 50-80ms   |
| Largest Contentful Paint | <200ms | 100-150ms |
| Time to Interactive      | <200ms | 80-120ms  |
| Total Blocking Time      | 0ms    | 0ms       |
| Cumulative Layout Shift  | 0      | 0         |
| JS Bundle Size           | <10KB  | 6KB       |
| HTML Size (gzipped)      | <50KB  | 30-40KB   |

---

## Confidence Score: 9/10

**Why not 10?**

- CSS `:has()` selector support is 95% (fallback needed for older browsers)
- Cloudflare KV has occasional propagation delays (5-60 seconds)
- Real-world user behavior may require more JS than projected

**Why 9?**

- Architecture is proven (diskprices.com, similar sites)
- Cloudflare edge is battle-tested at massive scale
- Astro islands are designed exactly for this use case
- Data size is small enough to embed entirely (~200KB for 50 providers)
- Zero dependencies on runtime API calls for core functionality

**The only risk:** Over-engineering. This architecture may be overkill for initial traffic. But when traffic comes, we will be ready.

---

_Speed is not a feature. Speed IS the product._

_This document was written at the altar of performance. May your TTFB be ever low._
