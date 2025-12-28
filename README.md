# ProxyPrice

The definitive proxy price comparison platform - compare 40+ proxy providers transparently.

## 🚀 Project Overview

ProxyPrice is a static site that provides transparent pricing comparison for proxy services across residential, datacenter, mobile, and ISP proxies. It normalizes complex pricing models into comparable $/GB metrics to help users find the best deal for their needs.

### Features

- ✅ **40+ Provider Comparisons**: Complete pricing data for major proxy providers
- ✅ **Normalized Pricing**: Convert all pricing models to comparable $/GB metrics
- ✅ **Price Calculator**: Interactive tool to find the best provider for your bandwidth needs
- ✅ **Proxy Type Pages**: Dedicated pages for residential, datacenter, mobile, and ISP proxies
- ✅ **Provider Detail Pages**: In-depth pricing breakdowns for each provider
- ✅ **SEO Optimized**: Meta tags, sitemap, robots.txt, and JSON-LD schema
- ✅ **Mobile Responsive**: Fully responsive design for all devices
- ✅ **Lightning Fast**: Static site optimized for CDN hosting

## 📊 Tech Stack

| Layer    | Technology                 | Purpose                                     |
| -------- | -------------------------- | ------------------------------------------- |
| Frontend | **Astro + Preact Islands** | Static HTML with interactive calculator     |
| Hosting  | **GitHub Pages**           | Simple static hosting + custom domain       |
| Data     | **Static JSON**            | Embedded at build time for instant loads    |
| Pipeline | **Python Scripts**         | Parse and normalize CSV data                |
| Styling  | **Vanilla CSS**            | No framework overhead, custom CSS variables |

## 🏗️ Project Structure

```
proxyprice/
├── front/                      # Astro frontend
│   ├── src/
│   │   ├── pages/             # Routes (SSG)
│   │   │   ├── index.astro    # Homepage
│   │   │   ├── residential.astro
│   │   │   ├── datacenter.astro
│   │   │   ├── mobile.astro
│   │   │   ├── isp.astro
│   │   │   ├── calculator.astro
│   │   │   ├── providers.astro
│   │   │   └── provider/[slug].astro  # Dynamic provider pages
│   │   ├── components/
│   │   │   ├── ComparisonTable.astro
│   │   │   └── Calculator.tsx          # Preact island
│   │   ├── layouts/
│   │   │   └── BaseLayout.astro
│   │   └── data/
│   │       ├── providers.json          # Generated data
│   │       └── pricing.json
│   ├── public/
│   │   └── robots.txt
│   └── astro.config.mjs
├── backend/                    # Data pipeline
│   ├── scripts/
│   │   ├── parse_csv.py       # Parse Price.csv
│   │   └── normalize.py       # Normalize pricing data
│   ├── tests/
│   │   └── test_normalization.py
│   └── requirements.txt
└── docs/
    ├── Price.csv              # Source pricing data
    └── genesis/               # Project documentation
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Python 3.9+

### Setup

1. **Install Frontend Dependencies**:

```bash
cd front
npm install
```

2. **Install Python Dependencies**:

```bash
cd backend
pip install -r requirements.txt
```

### Data Pipeline

Generate normalized JSON data from the CSV:

```bash
cd /path/to/proxyprice

# Run full pipeline (parse + normalize)
python3 backend/scripts/run_pipeline.py
```

This generates:

- `data/raw/providers_raw.json`
- `data/raw/pricing_raw.json`
- `front/src/data/providers.json`
- `front/src/data/pricing.json`

### Run Development Server

```bash
cd front
npm run dev
```

Visit: `http://localhost:4321`

### Build for Production

```bash
cd front
npm run build
```

Output: `dist/` directory with static HTML

### Run Tests

```bash
cd backend
python3 -m pytest tests/test_normalization.py -v
```

## 📈 Performance

- **Build time**: ~1 second
- **Bundle size**: 1.5MB (including 50 pages)
- **JavaScript**: <10KB (only calculator component)
- **Lighthouse Score Target**: 95+

## 🔄 Data Updates

To update pricing data:

1. Update `docs/Price.csv` with new pricing
2. Run data pipeline:
   ```bash
   python3 backend/scripts/parse_csv.py
   python3 backend/scripts/normalize.py
   ```
3. Rebuild frontend:
   ```bash
   cd front && npm run build
   ```
4. Deploy (automatic with git push)

## 🚀 Deployment

### GitHub Pages (Recommended)

See `docs/release/GITHUB_PAGES.md`.

### Environment Variables

- `PUBLIC_FEEDBACK_URL` (optional): GitHub Issues URL for “Report a Correction” link.

## 📝 Adding New Providers

1. Add provider data to `docs/Price.csv`:

   ```csv
   Name,Property Name,Price URL,Price Offers,Trial Offer
   NewProxy,Residential Proxy,https://example.com/pricing,"1 GB$5/GB$5
   10 GB$4/GB$40",7-day free trial
   ```

2. Run data pipeline
3. Rebuild and deploy

## 🧪 Testing

- **Unit Tests**: Python pytest for data normalization logic
- **Type Checking**: `npm run check` for TypeScript validation
- **Build Validation**: `npm run build` to ensure all pages generate

## 📊 Project Stats

- **43 Providers**: Comprehensive coverage
- **131 Pricing Records**: Across all proxy types
- **50 Static Pages**: Pre-rendered for instant loads
- **27 Comparable Providers**: With normalized $/GB pricing

## 🎯 Roadmap

### Phase 1 (MVP) ✅

- ✅ CSV parser and data normalization
- ✅ Static site with comparison tables
- ✅ Provider detail pages
- ✅ Price calculator
- ✅ SEO optimization

### Phase 2 (Future)

- [ ] Automated weekly scraping with SOAX API
- [ ] Price change tracking
- [ ] User reviews
- [ ] Provider claim/verification program
- [ ] API for programmatic access

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Credits

- **Astro**: Static site framework
- **Preact**: Lightweight React alternative for calculator
- **GitHub Pages**: Hosting

---

**Last Updated**: 2025-12-27
**Data Freshness**: Updated weekly
