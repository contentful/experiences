// Browser entry: resolve the optional package from this app's installed artifacts.
import {
  createPreviewInitializer as createSharedPreviewInitializer,
  getPreviewBinding,
} from '../../../scripts/implementation-preview.mjs';

export { getPreviewBinding };
declare const __LIVE_PREVIEW_ENABLED__: boolean;

export function createPreviewInitializer(binding: ReturnType<typeof getPreviewBinding>) {
  if (!binding) return undefined;
  return createSharedPreviewInitializer(
    binding,
    __LIVE_PREVIEW_ENABLED__ ? () => import('@contentful/experiences-live-preview') : undefined
  );
}
