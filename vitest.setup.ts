/**
 * Vitest setup file
 * This file runs before all tests
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Setup that runs once before all tests
beforeAll(() => {
  // Add any global setup here
  console.log('Starting test suite...');
});

// Cleanup that runs once after all tests
afterAll(() => {
  // Add any global cleanup here
  console.log('Test suite completed.');
});

// Cleanup that runs after each test
afterEach(() => {
  // Add any per-test cleanup here
});
