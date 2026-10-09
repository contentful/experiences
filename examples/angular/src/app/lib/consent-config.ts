/**
 * What the consent panel needs to create the Web runtime in the browser.
 *
 * Unlike the experience data, this is provided on every request, because the
 * panel renders on every page. The access token reaches the browser: use a
 * read-only delivery token. The panel only sends events and never fetches.
 */
export interface ConsentConfig {
  spaceId: string;
  environmentId: string;
  accessToken: string;
}

export function isConsentConfig(value: unknown): value is ConsentConfig {
  return (
    typeof value === 'object' && value !== null && 'spaceId' in value && 'accessToken' in value
  );
}
