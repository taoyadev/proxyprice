# ProxyPrice: Architecture of Resilience

## Authored by: The God of Robustness

> "Speed is ephemeral. Reliability is eternal."

---

## Executive Summary

This document presents an architecture designed for **99.99% uptime**, **graceful degradation under all failure modes**, and **defense in depth at every layer**. Every component is designed with the assumption that it will fail - the question is not "if" but "when" and "how gracefully."

The architecture sacrifices premature optimization for predictability, speed for stability, and complexity for reliability.

---

## 1. Architectural Principles (The Sacred Commandments)

### 1.1 Fail Safe, Never Fail Silent

Every failure MUST:

- Be detected within 30 seconds
- Be logged with full context
- Trigger appropriate alerting
- Degrade gracefully to a known-safe state
- Never corrupt user-facing data

### 1.2 Defense in Depth

Every layer validates its inputs. Never trust:

- The network
- The previous layer
- The data source
- The user
- Even yourself (assert invariants)

### 1.3 Immutability is Holiness

- Data mutations are logged as events
- Every change is versioned
- Point-in-time recovery is always possible
- Delete operations are soft by default

### 1.4 Observability is Not Optional

If you cannot measure it, you cannot manage it:

- Every request: traced
- Every error: contextualized
- Every metric: alerted on
- Every state change: auditable

---

## 2. System Architecture

### 2.1 High-Level Topology

```
                                   [Cloudflare Edge]
                                         |
                            +------------+------------+
                            |                         |
                      [Static Assets]           [API Calls]
                      Cloudflare Pages          CF Workers
                            |                         |
                            v                         v
                    +---------------+         +---------------+
                    |   Frontend    |         |  Edge Cache   |
                    |   (SvelteKit) |         |  (KV + R2)    |
                    +---------------+         +-------+-------+
                                                      |
                                              [Cache Miss]
                                                      |
                                                      v
                                           +------------------+
                                           |   VPS Backend    |
                                           |   (107.174.x.x)  |
                                           +--------+---------+
                                                    |
                                    +---------------+---------------+
                                    |               |               |
                              [Supabase]      [Redis Cache]   [File Storage]
                              PostgreSQL       Hot Data          Backups
```

### 2.2 Component Responsibility Matrix

| Component       | Primary Role                     | Failure Behavior     | Recovery Time   |
| --------------- | -------------------------------- | -------------------- | --------------- |
| Cloudflare Edge | DDoS protection, SSL termination | Automatic failover   | <1s             |
| CF Pages        | Static asset serving             | Cached at edge       | N/A (no server) |
| CF Workers      | API proxy, rate limiting         | Fallback to cached   | <5s             |
| Supabase        | Primary data store               | Read replicas, WAL   | <30s            |
| Redis           | Session cache, hot data          | Fallback to Postgres | <10s            |
| VPS             | Data pipeline, scheduled tasks   | Retry with backoff   | <60s            |

---

## 3. Data Layer: The Foundation of Trust

### 3.1 Schema Design (Immutable-First)

```sql
-- Core principle: Never delete, always version

CREATE SCHEMA IF NOT EXISTS proxyprice;

-- Provider entity with full audit trail
CREATE TABLE IF NOT EXISTS proxyprice.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Immutable identity
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Mutable but versioned
    name VARCHAR(255) NOT NULL,
    website_url TEXT NOT NULL,
    logo_url TEXT,
    description TEXT,

    -- Soft delete (never hard delete)
    is_active BOOLEAN DEFAULT true NOT NULL,
    deleted_at TIMESTAMPTZ,

    -- Audit fields
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,

    -- Constraints
    CONSTRAINT providers_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT providers_url_format CHECK (website_url ~ '^https?://'),
    CONSTRAINT providers_version_positive CHECK (version > 0)
);

-- Price snapshots: immutable historical record
CREATE TABLE IF NOT EXISTS proxyprice.price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES proxyprice.providers(id),

    -- Immutable snapshot data
    proxy_type VARCHAR(50) NOT NULL,
    pricing_model VARCHAR(50) NOT NULL,
    raw_pricing JSONB NOT NULL,
    normalized_price_per_gb DECIMAL(10,4),

    -- Validity window
    captured_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    valid_until TIMESTAMPTZ,

    -- Data quality signals
    source VARCHAR(50) NOT NULL, -- 'scrape', 'manual', 'api', 'user_report'
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    verification_status VARCHAR(20) DEFAULT 'pending',

    -- Constraints
    CONSTRAINT price_type_valid CHECK (proxy_type IN ('residential', 'datacenter', 'mobile', 'isp')),
    CONSTRAINT price_model_valid CHECK (pricing_model IN ('per_gb', 'per_ip', 'per_port', 'per_thread', 'flat', 'tiered')),
    CONSTRAINT confidence_range CHECK (confidence_score BETWEEN 0 AND 1),
    CONSTRAINT verification_valid CHECK (verification_status IN ('pending', 'verified', 'disputed', 'stale'))
);

-- Change log for full audit trail
CREATE TABLE IF NOT EXISTS proxyprice.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100) DEFAULT 'system',
    changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    request_id UUID,
    ip_address INET,
    user_agent TEXT
);

-- Index for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON proxyprice.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
    ON proxyprice.audit_log(changed_at DESC);
```

### 3.2 Data Integrity Constraints

```sql
-- Trigger: Prevent modification of immutable snapshots
CREATE OR REPLACE FUNCTION proxyprice.prevent_snapshot_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.captured_at < NOW() - INTERVAL '1 hour' THEN
        RAISE EXCEPTION 'Cannot modify snapshot older than 1 hour. Create new snapshot instead.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_old_snapshot_update
    BEFORE UPDATE ON proxyprice.price_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION proxyprice.prevent_snapshot_modification();

-- Trigger: Auto-audit all changes
CREATE OR REPLACE FUNCTION proxyprice.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO proxyprice.audit_log (
        table_name, record_id, action, old_values, new_values
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to all tables
CREATE TRIGGER audit_providers
    AFTER INSERT OR UPDATE OR DELETE ON proxyprice.providers
    FOR EACH ROW EXECUTE FUNCTION proxyprice.audit_trigger();

CREATE TRIGGER audit_price_snapshots
    AFTER INSERT OR UPDATE OR DELETE ON proxyprice.price_snapshots
    FOR EACH ROW EXECUTE FUNCTION proxyprice.audit_trigger();
```

### 3.3 Backup Strategy (Belt and Suspenders)

```yaml
# Backup tiers with redundancy

tier_1_continuous:
  method: PostgreSQL WAL streaming
  retention: 7 days point-in-time recovery
  rpo: 0 seconds (synchronous)
  rto: 5 minutes
  location: same datacenter (supabase internal)

tier_2_hourly:
  method: pg_dump to S3-compatible storage
  retention: 30 days
  rpo: 1 hour
  rto: 30 minutes
  location: different provider (Backblaze B2)
  encryption: AES-256 with key rotation

tier_3_daily:
  method: Full database export + schema documentation
  retention: 365 days
  rpo: 24 hours
  rto: 2 hours
  location: cold storage (Glacier Deep Archive)
  verification: Monthly restore test

tier_4_catastrophic:
  method: CSV export of critical tables
  retention: Indefinite
  location: Multiple geographic locations
  format: Human-readable, no vendor lock-in
```

---

## 4. API Layer: The Fortress Gates

### 4.1 Request Validation Pipeline

Every request passes through a validation gauntlet:

```
Request → [Rate Limit] → [Schema Validation] → [Sanitization] → [Authorization] → Handler
             ↓                   ↓                    ↓                ↓
         429 Too Many       400 Bad Request      400 Bad Request   403 Forbidden
```

### 4.2 Rate Limiting Strategy

```typescript
// Rate limiting tiers with graceful degradation

interface RateLimitConfig {
  // Per IP address (anonymous users)
  anonymous: {
    requests_per_minute: 30;
    requests_per_hour: 300;
    requests_per_day: 1000;
    burst_allowance: 10;
    penalty_duration_seconds: 60;
  };

  // Per API key (authenticated)
  authenticated: {
    requests_per_minute: 100;
    requests_per_hour: 3000;
    requests_per_day: 50000;
    burst_allowance: 50;
    penalty_duration_seconds: 30;
  };

  // Global limits (DDoS protection)
  global: {
    requests_per_second: 1000;
    concurrent_connections: 5000;
    circuit_breaker_threshold: 0.5; // 50% error rate
    circuit_breaker_duration_seconds: 30;
  };
}

// Response headers for transparency
// X-RateLimit-Limit: 30
// X-RateLimit-Remaining: 25
// X-RateLimit-Reset: 1703673600
// Retry-After: 45 (only on 429)
```

### 4.3 Input Validation Schema

```typescript
// Every endpoint has explicit schema validation

import { z } from "zod";

// Provider query parameters
const ProviderQuerySchema = z
  .object({
    proxy_type: z
      .enum(["residential", "datacenter", "mobile", "isp"])
      .optional()
      .describe("Filter by proxy type"),

    min_price: z
      .number()
      .min(0)
      .max(1000)
      .optional()
      .describe("Minimum price per GB"),

    max_price: z
      .number()
      .min(0)
      .max(1000)
      .optional()
      .describe("Maximum price per GB"),

    countries: z
      .array(z.string().length(2))
      .max(50)
      .optional()
      .describe("ISO country codes"),

    sort_by: z
      .enum(["price", "name", "pool_size", "updated_at"])
      .default("price"),

    sort_order: z.enum(["asc", "desc"]).default("asc"),

    page: z.number().int().min(1).max(100).default(1),

    limit: z.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.min_price || !data.max_price || data.min_price <= data.max_price,
    { message: "min_price must be less than or equal to max_price" },
  );

// Calculator input with strict validation
const CalculatorInputSchema = z
  .object({
    monthly_bandwidth_gb: z
      .number()
      .min(1)
      .max(100000)
      .describe("Expected monthly bandwidth usage"),

    concurrent_connections: z
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .default(1),

    target_countries: z
      .array(z.string().length(2))
      .min(1)
      .max(50)
      .describe("Required country coverage"),

    proxy_type: z.enum(["residential", "datacenter", "mobile", "isp"]),

    priority: z.enum(["price", "reliability", "speed"]).default("price"),
  })
  .strict(); // Reject unknown fields
```

### 4.4 Security Headers

```typescript
// Comprehensive security headers for all responses

const securityHeaders = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",

  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",

  // XSS protection (legacy browsers)
  "X-XSS-Protection": "1; mode=block",

  // HTTPS enforcement
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

  // Referrer policy
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Permissions policy
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",

  // CORS (restrictive by default)
  "Access-Control-Allow-Origin": "https://proxyprice.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",

  // Cache control for sensitive data
  "Cache-Control": "private, no-store, must-revalidate",
};
```

---

## 5. Caching Strategy: Speed Through Reliability

### 5.1 Multi-Tier Cache Architecture

```
Request → [Edge Cache (CF)] → [Application Cache (Redis)] → [Database Query Cache] → [Database]
              TTL: 5min            TTL: 15min                   TTL: 1min              Source
```

### 5.2 Cache Invalidation Protocol

```typescript
// Cache invalidation is explicit, never implicit

interface CacheInvalidationEvent {
  type:
    | "provider_update"
    | "price_change"
    | "manual_purge"
    | "scheduled_refresh";
  affected_keys: string[];
  reason: string;
  timestamp: Date;
  initiated_by: string;
}

// Stale-while-revalidate pattern for graceful updates
const cacheConfig = {
  providers_list: {
    max_age_seconds: 300, // Fresh for 5 minutes
    stale_while_revalidate: 600, // Serve stale for 10 more minutes while refreshing
    stale_if_error: 3600, // Serve stale for 1 hour if backend fails
  },

  provider_detail: {
    max_age_seconds: 600,
    stale_while_revalidate: 1800,
    stale_if_error: 7200,
  },

  price_calculation: {
    max_age_seconds: 60, // More dynamic data
    stale_while_revalidate: 120,
    stale_if_error: 1800,
  },
};
```

### 5.3 Cache Warming Strategy

```typescript
// Proactive cache warming for critical paths

const warmingSchedule = [
  {
    path: "/api/providers",
    variants: ["?proxy_type=residential", "?proxy_type=datacenter"],
    schedule: "*/5 * * * *", // Every 5 minutes
    priority: "critical",
  },
  {
    path: "/api/providers/[slug]",
    slugs: ["bright-data", "oxylabs", "smartproxy", "soax"], // Top 20
    schedule: "*/15 * * * *", // Every 15 minutes
    priority: "high",
  },
  {
    path: "/api/calculator",
    variants: [
      "?bandwidth=100&type=residential",
      "?bandwidth=500&type=residential",
      "?bandwidth=1000&type=datacenter",
    ],
    schedule: "0 * * * *", // Every hour
    priority: "medium",
  },
];
```

---

## 6. Error Handling: Embrace the Chaos

### 6.1 Error Classification System

```typescript
// Errors are categorized by recoverability and user impact

enum ErrorCategory {
  // User errors - return clear guidance
  VALIDATION = "validation", // 400: Bad input
  AUTHENTICATION = "auth", // 401: Not authenticated
  AUTHORIZATION = "authz", // 403: Not authorized
  NOT_FOUND = "not_found", // 404: Resource missing
  RATE_LIMITED = "rate_limited", // 429: Too many requests

  // Server errors - log and recover
  TEMPORARY = "temporary", // 503: Try again later
  UPSTREAM = "upstream", // 502: External service failed
  INTERNAL = "internal", // 500: Our bug

  // Critical errors - alert immediately
  DATA_CORRUPTION = "corruption", // Data integrity violation
  SECURITY = "security", // Potential attack
  CATASTROPHIC = "catastrophic", // System-wide failure
}

interface ErrorResponse {
  error: {
    code: string; // Machine-readable: 'VALIDATION_ERROR'
    message: string; // Human-readable: 'Invalid proxy type'
    category: ErrorCategory;
    request_id: string; // For support correlation
    timestamp: string; // ISO 8601

    // Only for validation errors
    details?: Array<{
      field: string;
      message: string;
      received: unknown;
    }>;

    // Recovery guidance
    retry_after?: number; // Seconds until retry makes sense
    documentation?: string; // Link to relevant docs
  };
}
```

### 6.2 Circuit Breaker Pattern

```typescript
// Protect against cascading failures

interface CircuitBreakerConfig {
  name: string;
  threshold: number; // Failure count to trip
  window_ms: number; // Rolling window for counting
  cooldown_ms: number; // Time before retry
  half_open_requests: number; // Probe requests in half-open state
}

const circuitBreakers: Record<string, CircuitBreakerConfig> = {
  supabase: {
    name: "supabase",
    threshold: 5,
    window_ms: 60000,
    cooldown_ms: 30000,
    half_open_requests: 3,
  },

  soax_scraper: {
    name: "soax_scraper",
    threshold: 3,
    window_ms: 300000, // 5 minutes
    cooldown_ms: 60000, // 1 minute
    half_open_requests: 1,
  },

  external_apis: {
    name: "external_apis",
    threshold: 10,
    window_ms: 60000,
    cooldown_ms: 30000,
    half_open_requests: 2,
  },
};

// Circuit breaker states:
// CLOSED: Normal operation
// OPEN: Fail fast, do not attempt requests
// HALF-OPEN: Allow limited probes to test recovery
```

### 6.3 Retry Strategy with Exponential Backoff

```typescript
// Intelligent retry with jitter to prevent thundering herd

interface RetryConfig {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  exponential_base: number;
  jitter_factor: number; // 0-1, randomness to add
  retryable_errors: string[];
}

const retryConfig: RetryConfig = {
  max_attempts: 3,
  initial_delay_ms: 1000,
  max_delay_ms: 30000,
  exponential_base: 2,
  jitter_factor: 0.3,
  retryable_errors: [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "NETWORK_ERROR",
    "SERVICE_UNAVAILABLE",
  ],
};

// Delay calculation: min(max_delay, initial_delay * base^attempt) * (1 + random(jitter))
// Attempt 1: 1000ms * (1 + 0.15) = ~1150ms
// Attempt 2: 2000ms * (1 + 0.20) = ~2400ms
// Attempt 3: 4000ms * (1 + 0.10) = ~4400ms
```

---

## 7. Monitoring and Alerting: The Watchtowers

### 7.1 Metrics Collection

```yaml
# Prometheus-style metrics for all critical paths

metrics:
  counters:
    - name: http_requests_total
      labels: [method, path, status_code]

    - name: database_queries_total
      labels: [table, operation, status]

    - name: cache_hits_total
      labels: [cache_tier, key_pattern]

    - name: errors_total
      labels: [category, code]

  histograms:
    - name: http_request_duration_seconds
      labels: [method, path]
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

    - name: database_query_duration_seconds
      labels: [table, operation]
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]

    - name: external_api_duration_seconds
      labels: [service]
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]

  gauges:
    - name: active_connections
      labels: [type]

    - name: cache_size_bytes
      labels: [cache_tier]

    - name: queue_depth
      labels: [queue_name]
```

### 7.2 Alert Thresholds

```yaml
# Alert definitions with severity levels

alerts:
  # Critical: Page immediately
  - name: HighErrorRate
    condition: rate(errors_total{category!="validation"}[5m]) > 0.05
    severity: critical
    channels: [pagerduty, slack_oncall]
    description: "Error rate exceeds 5% over 5 minutes"
    runbook: "/docs/runbooks/high-error-rate.md"

  - name: DatabaseUnavailable
    condition: up{job="supabase"} == 0
    severity: critical
    channels: [pagerduty, slack_oncall, email_all]
    description: "Supabase database is unreachable"
    runbook: "/docs/runbooks/database-down.md"

  # Warning: Investigate soon
  - name: HighLatency
    condition: histogram_quantile(0.95, http_request_duration_seconds) > 2
    severity: warning
    channels: [slack_engineering]
    description: "P95 latency exceeds 2 seconds"

  - name: CacheHitRateLow
    condition: rate(cache_hits_total[1h]) / rate(cache_requests_total[1h]) < 0.8
    severity: warning
    channels: [slack_engineering]
    description: "Cache hit rate below 80%"

  - name: DataStale
    condition: time() - max(price_snapshot_timestamp) > 86400
    severity: warning
    channels: [slack_data]
    description: "No price updates in 24 hours"

  # Info: Log for analysis
  - name: UnusualTrafficPattern
    condition: rate(http_requests_total[5m]) > 3 * avg_over_time(rate(http_requests_total[5m])[1d:5m])
    severity: info
    channels: [slack_analytics]
    description: "Traffic 3x higher than daily average"
```

### 7.3 Health Check Endpoints

```typescript
// Comprehensive health checks for each component

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms: number;
  last_checked: string;
  details?: Record<string, unknown>;
}

interface SystemHealth {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  components: {
    database: HealthCheckResult;
    cache: HealthCheckResult;
    external_apis: HealthCheckResult;
    storage: HealthCheckResult;
  };
}

// Health check endpoints
// GET /health/live   - Is the process running? (for k8s liveness)
// GET /health/ready  - Can we serve traffic? (for k8s readiness)
// GET /health/deep   - Full component check (for monitoring)
```

---

## 8. Data Pipeline: The Scraping Fortress

### 8.1 Scraping Architecture

```
[Scheduler (Cron)]
       |
       v
[Job Queue (Redis)]
       |
       v
[Worker Pool (n=3)]
       |
       +---> [SOAX Scraping API]
       |            |
       |            v
       |     [Raw Response]
       |            |
       v            v
[Retry Handler] <-- [Validator]
       |                |
       |                v
       |     [Data Normalizer]
       |                |
       |                v
       |     [Quality Scorer]
       |                |
       v                v
[Dead Letter Queue] [Database Write]
       |                |
       v                v
[Manual Review]   [Cache Invalidation]
```

### 8.2 Scraping Job Schema

```typescript
interface ScrapingJob {
  id: string;
  provider_id: string;
  target_url: string;
  priority: "critical" | "high" | "normal" | "low";

  // Scheduling
  scheduled_at: Date;
  max_attempts: number;
  attempt_count: number;

  // Status tracking
  status: "pending" | "running" | "completed" | "failed" | "dead_letter";
  started_at?: Date;
  completed_at?: Date;

  // Results
  raw_response?: string;
  parsed_data?: unknown;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  // Quality signals
  response_time_ms?: number;
  content_hash?: string;
  change_detected?: boolean;
}

// Job processing guarantees:
// - At-least-once delivery (idempotent handlers)
// - Ordered within provider (no concurrent scrapes)
// - Exponential backoff on failure
// - Dead letter after max attempts
```

### 8.3 Data Validation Rules

```typescript
// Strict validation for scraped data

const priceValidationRules = {
  // Sanity checks
  price_per_gb: {
    min: 0.01, // $0.01/GB minimum (anything lower is suspicious)
    max: 100, // $100/GB maximum (anything higher needs review)
    type: "number",
    required: true,
  },

  // Historical comparison
  price_change_threshold: 0.5, // Flag if price changes >50% from last snapshot

  // Cross-validation
  must_match_provider_website: true,
  allowed_variance: 0.05, // 5% allowed for rounding differences

  // Structural validation
  required_fields: [
    "proxy_type",
    "pricing_model",
    "price_amount",
    "price_unit",
  ],

  // Anomaly detection
  flag_if: [
    "price_is_lowest_ever",
    "price_is_highest_ever",
    "new_pricing_model",
    "removed_tier",
  ],
};

// Validation outcomes:
// - ACCEPT: Write to database immediately
// - REVIEW: Write with review flag, alert data team
// - REJECT: Do not write, log for investigation
```

---

## 9. Frontend Resilience

### 9.1 Progressive Enhancement Strategy

```typescript
// Core functionality works without JavaScript

const resilienceLayers = {
  // Layer 0: HTML works
  base: {
    server_rendered: true,
    static_table: true,
    no_js_required: true,
  },

  // Layer 1: CSS enhances
  enhanced: {
    responsive_layout: true,
    visual_feedback: true,
    graceful_degradation: true,
  },

  // Layer 2: JS adds interactivity
  interactive: {
    client_filtering: true,
    client_sorting: true,
    calculator: true,
    optimistic_updates: false, // Never show unconfirmed data
  },
};
```

### 9.2 Offline Support

```typescript
// Service worker strategy for offline resilience

const offlineStrategy = {
  // Cache first for static assets
  static: {
    strategy: "cache-first",
    max_age_days: 30,
    paths: ["/css/", "/js/", "/fonts/", "/images/"],
  },

  // Network first for data, fallback to cache
  data: {
    strategy: "network-first",
    timeout_ms: 5000,
    fallback: "cache",
    paths: ["/api/providers", "/api/calculator"],
  },

  // Stale-while-revalidate for pages
  pages: {
    strategy: "stale-while-revalidate",
    max_age_hours: 1,
    paths: ["/", "/providers/", "/compare/"],
  },

  // Offline page for complete network failure
  offline_page: "/offline.html",
};
```

### 9.3 Error Boundaries

```typescript
// Component-level error containment

interface ErrorBoundaryConfig {
  // What to show when component fails
  fallback: "placeholder" | "retry_button" | "nothing";

  // How to report the error
  report_to: "sentry" | "console" | "silent";

  // Recovery options
  auto_retry: boolean;
  retry_delay_ms: number;
  max_retries: number;
}

// Error boundaries are placed at:
// - Page level (catch routing/data loading errors)
// - Widget level (isolate calculator failures)
// - Component level (individual provider cards)
```

---

## 10. Security Hardening

### 10.1 Input Sanitization

```typescript
// All user input is sanitized before use

const sanitizationRules = {
  // Text fields
  text: {
    max_length: 1000,
    strip_html: true,
    strip_null_bytes: true,
    normalize_unicode: true,
    trim_whitespace: true,
  },

  // URLs
  url: {
    allowed_protocols: ["https"],
    validate_domain: true,
    strip_credentials: true, // Remove username:password
    max_length: 2048,
  },

  // Numbers
  number: {
    parse_strictly: true, // Reject '12abc'
    finite_only: true, // Reject Infinity, NaN
    max_decimal_places: 4,
  },

  // Arrays
  array: {
    max_length: 100,
    unique_elements: true,
    sanitize_elements: true,
  },
};
```

### 10.2 SQL Injection Prevention

```typescript
// Database access is exclusively through parameterized queries

// NEVER do this:
// const query = `SELECT * FROM providers WHERE slug = '${userInput}'`;

// ALWAYS do this:
const safeQuery = {
  text: "SELECT * FROM proxyprice.providers WHERE slug = $1 AND is_active = true",
  values: [sanitize(userInput)],
  name: "get-provider-by-slug", // Prepared statement
};

// Additional protections:
// - Read-only database credentials for API
// - Schema-level permissions (can't access other schemas)
// - Query timeouts (max 30 seconds)
// - Result set limits (max 1000 rows)
```

### 10.3 Environment Security

```yaml
# Secrets management

secrets:
  storage: "environment variables via Docker secrets"
  rotation: "quarterly, or immediately on suspected compromise"
  access_audit: "all secret access is logged"

required_secrets:
  - DATABASE_URL # Supabase connection string
  - SOAX_API_KEY # Scraping API
  - REDIS_URL # Cache connection
  - SENTRY_DSN # Error reporting

prohibited_in_logs:
  - passwords
  - api_keys
  - tokens
  - connection_strings
  - user_emails
  - ip_addresses (hashed instead)
```

---

## 11. Disaster Recovery Playbook

### 11.1 Incident Severity Levels

| Level | Description          | Response Time     | Escalation     |
| ----- | -------------------- | ----------------- | -------------- |
| SEV1  | Complete outage      | 15 minutes        | All hands      |
| SEV2  | Major feature broken | 1 hour            | On-call + lead |
| SEV3  | Minor feature broken | 4 hours           | On-call        |
| SEV4  | Cosmetic issue       | Next business day | Ticket         |

### 11.2 Recovery Procedures

```yaml
# Runbook: Database Corruption

scenario: "Data integrity violation detected"

immediate_actions: 1. "Stop all write operations (enable read-only mode)"
  2. "Alert team via PagerDuty"
  3. "Capture current state (pg_dump)"

investigation: 1. "Query audit_log for recent changes"
  2. "Identify scope of corruption"
  3. "Determine root cause"

recovery_options:
  option_a:
    name: "Point-in-time recovery"
    when: "Corruption is recent (<24h)"
    steps:
      - "Identify safe timestamp from audit log"
      - "Restore from WAL to that point"
      - "Verify data integrity"
      - "Resume operations"

  option_b:
    name: "Surgical correction"
    when: "Limited records affected"
    steps:
      - "Identify affected records from audit log"
      - "Restore specific records from backup"
      - "Verify data integrity"
      - "Resume operations"

  option_c:
    name: "Full restore"
    when: "Widespread corruption"
    steps:
      - "Restore from last known good backup"
      - "Apply WAL to safe point"
      - "Verify data integrity"
      - "Resume operations"

post_incident:
  - "Write incident report"
  - "Identify prevention measures"
  - "Update runbook if needed"
```

### 11.3 Failover Scenarios

```yaml
# Component failover matrix

supabase_database:
  primary_failure:
    detection: "Health check timeout"
    action: "Automatic failover to read replica"
    data_loss: "None (synchronous replication)"
    downtime: "<30 seconds"

  complete_outage:
    detection: "All replicas unreachable"
    action: "Serve cached data, queue writes"
    data_loss: "Writes during outage"
    downtime: "Read: None, Write: Until recovery"

redis_cache:
  failure:
    detection: "Connection refused"
    action: "Bypass cache, hit database directly"
    impact: "Higher latency, database load"
    automatic_recovery: true

cloudflare_edge:
  regional_failure:
    detection: "CF health dashboard"
    action: "Traffic routed to other regions"
    impact: "Slight latency increase for affected users"
    automatic_recovery: true

vps_backend:
  failure:
    detection: "Health check from CF Worker"
    action: "Serve fully cached responses"
    impact: "Data may be up to 1 hour stale"
    manual_intervention: "Required for data pipeline"
```

---

## 12. Testing Strategy

### 12.1 Test Pyramid

```
                    /\
                   /  \
                  / E2E \        <- 10%: Critical user journeys
                 /  Tests \
                /----------\
               /            \
              / Integration  \   <- 30%: API contracts, DB queries
             /    Tests       \
            /------------------\
           /                    \
          /     Unit Tests       \  <- 60%: Business logic, utilities
         /                        \
        /--------------------------\
```

### 12.2 Chaos Engineering

```typescript
// Intentional failure injection for resilience testing

const chaosExperiments = [
  {
    name: "Database Latency",
    inject: () => addLatency("supabase", 2000),
    duration_minutes: 5,
    expected_behavior: "Cache serves stale data, no user errors",
    rollback: () => removeLatency("supabase"),
  },
  {
    name: "Cache Failure",
    inject: () => killProcess("redis"),
    duration_minutes: 10,
    expected_behavior: "Direct database queries, higher latency",
    rollback: () => restartProcess("redis"),
  },
  {
    name: "External API Timeout",
    inject: () => blockOutbound("soax.com"),
    duration_minutes: 30,
    expected_behavior: "Scraping jobs fail gracefully, alerts sent",
    rollback: () => unblockOutbound("soax.com"),
  },
  {
    name: "High Load",
    inject: () => sendTraffic(1000, "requests_per_second"),
    duration_minutes: 5,
    expected_behavior: "Rate limiting kicks in, no crashes",
    rollback: () => stopTraffic(),
  },
];

// Schedule: Monthly in staging, quarterly in production (off-peak)
```

---

## 13. Performance Budgets

### 13.1 Response Time Targets

| Endpoint                | P50   | P95   | P99   | Timeout |
| ----------------------- | ----- | ----- | ----- | ------- |
| `/` (homepage)          | 100ms | 300ms | 500ms | 5s      |
| `/api/providers`        | 50ms  | 150ms | 300ms | 3s      |
| `/api/calculator`       | 100ms | 300ms | 500ms | 5s      |
| `/api/providers/[slug]` | 50ms  | 150ms | 300ms | 3s      |
| Scraping jobs           | N/A   | N/A   | N/A   | 60s     |

### 13.2 Resource Budgets

```yaml
# Resource constraints per component

frontend:
  bundle_size_kb: 200 # Gzipped JavaScript
  first_contentful_paint_ms: 1500
  time_to_interactive_ms: 3000
  cumulative_layout_shift: 0.1

backend:
  memory_per_request_mb: 50
  database_connections: 20
  concurrent_scraping_jobs: 3

infrastructure:
  cpu_alert_threshold: 80%
  memory_alert_threshold: 85%
  disk_alert_threshold: 90%
```

---

## 14. Documentation Requirements

### 14.1 Required Documentation

- **API Reference**: OpenAPI 3.0 spec, auto-generated
- **Runbooks**: For every alert, a recovery procedure
- **Architecture Decision Records**: Why we made each choice
- **Data Dictionary**: Schema documentation with business context
- **Incident Reports**: Post-mortems for all SEV1/SEV2 incidents

### 14.2 Documentation as Code

```yaml
# Documentation is version-controlled and tested

documentation:
  api_spec:
    format: OpenAPI 3.0
    location: /docs/api/openapi.yaml
    validation: "npm run validate:api"

  runbooks:
    format: Markdown
    location: /docs/runbooks/
    required_sections: [scenario, detection, actions, rollback, post_incident]

  adr:
    format: Markdown (MADR template)
    location: /docs/adr/
    required: true for any architectural change
```

---

## 15. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

- [ ] Set up Supabase schema with audit logging
- [ ] Implement backup automation
- [ ] Configure Cloudflare with security headers
- [ ] Set up monitoring and alerting
- [ ] Create health check endpoints

### Phase 2: Core API (Weeks 3-4)

- [ ] Implement rate limiting
- [ ] Add input validation with Zod
- [ ] Set up error handling and circuit breakers
- [ ] Configure caching layers
- [ ] Write integration tests

### Phase 3: Data Pipeline (Weeks 5-6)

- [ ] Build scraping job queue
- [ ] Implement retry logic with backoff
- [ ] Add data validation and anomaly detection
- [ ] Set up dead letter queue
- [ ] Create data quality dashboard

### Phase 4: Frontend (Weeks 7-8)

- [ ] Implement server-side rendering
- [ ] Add error boundaries
- [ ] Set up service worker for offline support
- [ ] Implement progressive enhancement
- [ ] Performance optimization

### Phase 5: Hardening (Weeks 9-10)

- [ ] Security audit
- [ ] Load testing
- [ ] Chaos engineering experiments
- [ ] Documentation review
- [ ] Runbook testing

---

## Confidence Assessment

### What I Am Confident About (High: 9/10)

1. **Data layer design**: Immutable snapshots with audit logging will prevent data loss and enable full recovery
2. **Error handling patterns**: Circuit breakers and retry logic will prevent cascading failures
3. **Caching strategy**: Multi-tier caching with stale-while-revalidate will maintain availability
4. **Security measures**: Input validation and sanitization will prevent common attack vectors
5. **Monitoring approach**: Comprehensive metrics and alerts will enable rapid incident response

### What Requires Validation (Medium: 7/10)

1. **Scraping reliability**: SOAX API behavior under various failure modes needs testing
2. **Cache hit rates**: Actual traffic patterns will determine effectiveness
3. **Alert thresholds**: Will need tuning based on real production data
4. **Recovery procedures**: Runbooks need to be tested in realistic scenarios

### What Is Uncertain (Lower: 5/10)

1. **Scale limits**: Architecture is designed for 10K daily users; beyond that needs reassessment
2. **Cost optimization**: Cloudflare and SOAX costs at scale need monitoring
3. **Edge cases in data normalization**: Some pricing models may break normalization logic

---

## Final Confidence Score: 8/10

This architecture prioritizes reliability at every layer. The design is conservative, preferring proven patterns over novel approaches. Every component has a failure mode and recovery strategy.

The 2-point deduction reflects:

- Uncertainty about scraping API reliability (external dependency)
- Complexity of price normalization edge cases (business logic)

**This architecture will not be the fastest. It will not be the most feature-rich at launch. But it will be awake at 3 AM when everything else is failing, quietly serving cached data and paging the on-call engineer with exactly the information they need to fix it.**

---

_Document authored by: The God of Robustness_
_Date: 2025-12-27_
_Status: Ready for architecture convergence_
