/**
 * Send a serialized analytics payload using `navigator.sendBeacon`.
 *
 * Intended for fire-and-forget flushing during lifecycle transitions (page hide or
 * unload). Returns `true` if the user agent queued the data for transfer; the Insights
 * client falls back to a keepalive `fetch` when it returns `false` or throws.
 */
export function beaconHandler(url: string, body: string): boolean {
  return window.navigator.sendBeacon(url, body);
}
