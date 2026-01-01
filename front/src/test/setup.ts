/**
 * Vitest Setup File
 *
 * Configures the testing environment with jsdom and custom matchers.
 */

import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/preact";

// Extend Vitest's expect with jest-dom matchers
// Import matchers directly to avoid top-level expect.extend call
import { matchers } from "@testing-library/jest-dom/matchers";

Object.assign(expect, matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;
