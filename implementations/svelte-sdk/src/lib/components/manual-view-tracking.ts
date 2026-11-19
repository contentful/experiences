import { getContext, setContext } from 'svelte';

const manualTracking = Symbol();
const suppressAutomaticTracking = {
  'data-ctfl-track-views': 'false',
  'data-ctfl-track-hovers': 'false',
  'data-ctfl-track-clicks': 'false',
};

export function setManualViewTracking(isManual: () => boolean) {
  setContext(manualTracking, isManual);
}

export function getManualViewTrackingAttributes() {
  const isManual = getContext<(() => boolean) | undefined>(manualTracking);
  return () => (isManual?.() ? suppressAutomaticTracking : undefined);
}
