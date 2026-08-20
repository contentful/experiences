// Angular's JIT compiler. Tests run without an AOT build step, so the runtime
// needs the compiler available to compile the inline templates on first use.
import '@angular/compiler';

import '@testing-library/jest-dom/vitest';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
