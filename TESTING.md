# Testing Guide

This document describes the testing infrastructure for the ProxyPrice project.

## Overview

ProxyPrice uses a comprehensive testing approach:

- **Frontend**: Vitest + Testing Library for Preact components
- **Backend**: pytest for Python data processing scripts
- **CI/CD**: GitHub Actions runs all tests before deployment

## Frontend Tests

### Setup

Frontend tests use Vitest with jsdom environment for component testing.

```bash
cd front
npm install
```

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (interactive)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Test Structure

```
front/src/
├── components/
│   └── __tests__/
│       └── Calculator.test.tsx    # Component tests
├── lib/
│   └── __tests__/
│       └── calculatorLogic.test.ts # Logic unit tests
└── test/
    ├── setup.ts                    # Vitest configuration
    ├── test-utils.ts               # Mock data and utilities
    └── README.md                   # Test documentation
```

### Test Files

| File                      | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `Calculator.test.tsx`     | Integration tests for the Calculator component |
| `calculatorLogic.test.ts` | Unit tests for recommendation logic            |

### Coverage

Coverage thresholds are set at 50% for:

- Statements
- Branches
- Functions
- Lines

Coverage reports are generated in `front/coverage/`.

## Backend Tests

### Setup

Backend tests use pytest for Python testing.

```bash
cd backend
pip install -r requirements.txt
```

### Running Tests

```bash
# Run all tests
make test

# Run with coverage
make test-cov

# Run in watch mode
make test-watch

# Run manually with pytest
pytest tests/ -v
```

### Test Structure

```
backend/tests/
├── test_parse_csv.py           # CSV parsing tests
├── test_parse_csv_edge_cases.py # Edge case tests
└── test_normalization.py        # Data normalization tests
```

### Test Categories

#### test_parse_csv.py

Tests for the CSV parsing module:

- GB implicit/explicit pricing
- IP-based pricing
- Monthly/colon pricing
- Days per IP pricing
- GB range pricing (PAYG)
- Days total pricing
- Decimal total plan GB

#### test_parse_csv_edge_cases.py

Edge case tests including:

- Malformed data handling
- Empty strings and invalid formats
- Duplicate provider handling
- Price calculation edge cases
- Proxy type normalization variations
- URL extraction edge cases
- Multi-line offer parsing
- Special pricing models (per-hour, per-day, etc.)
- Real-world edge case patterns

#### test_normalization.py

Tests for data normalization:

- Min/max price per GB calculation
- Empty tier handling
- Mixed pricing model handling

### Configuration

Pytest is configured via `pyproject.toml`:

```toml
[tool.pytest.ini_options]
minversion = "7.0"
testpaths = ["tests"]
python_files = ["test_*.py"]
```

## Validation Scripts

### Data Validation

```bash
# Run basic validation
npm run validate:data

# Run enhanced Zod-based validation
npm run validate:data:zod
```

### Link Checking

```bash
# Check for broken links and missing images
npm run linkcheck
```

The enhanced linkcheck script now includes:

- Internal link validation
- Missing image detection
- Orphaned image warnings
- Page structure checks (empty titles, missing meta descriptions)
- Large page warnings (>500KB)

## CI/CD Pipeline

Both GitHub Actions workflows (Cloudflare Pages and GitHub Pages) now include:

1. **Test Job**: Runs all frontend tests with coverage
2. **Build Job**: Lints, type-checks, builds, validates data, and runs linkcheck
3. **Deploy Job**: Only runs if tests pass

### Workflow Files

- `.github/workflows/cloudflare-pages.yml`
- `.github/workflows/pages.yml`

## Runtime Validation (Zod Schemas)

Zod schemas in `front/src/lib/schemas.ts` define runtime types for:

- `PricingTier` - Individual pricing tier structure
- `PricingRecord` - Complete pricing record
- `Provider` - Provider information
- `RedirectEntry` - Affiliate redirect entries
- `PricingData` - Full pricing data structure
- `ProvidersData` - Full providers data structure

These schemas can be used for runtime validation:

```typescript
import { validatePricingData, validateProvidersData } from "../lib/schemas";

const pricingResult = validatePricingData(data);
if (!pricingResult.success) {
  console.error(pricingResult.errors);
}
```

## Best Practices

### Frontend Tests

1. Test user interactions, not implementation details
2. Use `screen` queries from Testing Library
3. Mock external dependencies (API calls, etc.)
4. Keep tests focused and independent
5. Use descriptive test names

### Backend Tests

1. Test edge cases thoroughly
2. Use parametrized tests for similar cases
3. Mock file I/O when appropriate
4. Test error handling paths
5. Keep tests fast (avoid slow I/O)

## Troubleshooting

### Frontend Tests

If tests fail:

1. Check that all dependencies are installed
2. Verify Node.js version (22 recommended)
3. Try clearing cache: `rm -rf node_modules/.vite`

### Backend Tests

If tests fail:

1. Verify Python version (3.10+)
2. Reinstall dependencies: `pip install -r requirements.txt`
3. Check that scripts are importable from tests

## Adding New Tests

### Frontend Component Test

```tsx
// src/components/__tests__/MyComponent.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import MyComponent from "../MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Expected Text")).toBeInTheDocument();
  });
});
```

### Backend Unit Test

```python
# tests/test_my_module.py
import pytest
from scripts.my_module import my_function

def test_my_function_basic():
    result = my_function("input")
    assert result == "expected"

@pytest.mark.parametrize("input,expected", [
    ("a", "1"),
    ("b", "2"),
])
def test_my_function_parametrized(input, expected):
    assert my_function(input) == expected
```

## Test Coverage Goals

| Component         | Target | Current |
| ----------------- | ------ | ------- |
| Calculator.tsx    | 80%    | -       |
| parse_csv.py      | 90%    | ~85%    |
| normalize.py      | 90%    | ~70%    |
| validate-data.mjs | 80%    | ~60%    |
| linkcheck.mjs     | 70%    | ~50%    |

Run coverage reports to see current status.
