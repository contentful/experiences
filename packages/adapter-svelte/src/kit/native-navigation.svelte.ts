import { afterNavigate } from '$app/navigation';

/** Observe only the committed URL at the stable request boundary. */
export function useNativeNavigation(getRouteKey: () => string | undefined) {
  let revision = $state(0);
  afterNavigate(() => {
    revision++;
  });
  return {
    get routeKey() {
      void revision;
      return (
        getRouteKey() ??
        (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)
      );
    },
  };
}
