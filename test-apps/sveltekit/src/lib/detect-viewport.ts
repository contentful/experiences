/**
 * Detect a viewport id from a User-Agent string for SSR seeding.
 *
 * The returned id seeds `ServerExperienceRenderer`'s `initialViewportId` so
 * the server-rendered output matches the device's expected viewport. The
 * client renderer uses the same id as its first paint, then transitions to
 * live `matchMedia` matching as the window resizes — avoids hydration drift.
 */

export function detectViewportFromUserAgent(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(ua)) {
    return 'mobile';
  }
  if (/ipad|tablet|kindle|playbook|silk/.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}
