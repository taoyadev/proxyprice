# Tests

This directory contains test setup, utilities, and mocks for the ProxyPrice frontend application.

## Structure

```
src/test/
├── setup.ts         # Vitest setup file with jsdom configuration
├── test-utils.ts    # Common test utilities and mock data
└── README.md        # This file
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## Test Utilities

### Mock Data

The `test-utils.ts` file exports common mock data:

- `mockPricingTiers` - Predefined pricing tier configurations
- `mockPricingRecords` - Sample pricing records for testing
- `mockProviders` - Sample provider data

### Helper Functions

- `renderOptions` - Common rendering options for @testing-library/preact
- `waitFor(ms)` - Promise-based delay helper
- `flushPromises()` - Flush pending promises

## Writing Tests

Tests should be placed alongside the code they test, using the `.test.ts` or `.test.tsx` extension.

Example test file structure:

```tsx
// src/components/__tests__/MyComponent.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import MyComponent from "../MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

## Coverage

Coverage thresholds are set at 50% for all metrics. These can be adjusted in `vitest.config.ts`.

Coverage reports are generated in:

- Terminal output (text)
- `coverage/coverage.json` (JSON)
- `coverage/index.html` (HTML)
