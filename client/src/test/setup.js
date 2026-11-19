import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement window.scrollTo
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn();
}

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});
