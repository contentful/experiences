/*
 * Re-exports the design-value helpers from core, so this package's public API
 * covers design resolution without customers reaching into core directly.
 */

export {
  applyTokenResolver,
  getDesignValue,
  resolveDesignProperties,
} from '@contentful/experiences-sdk-core';
