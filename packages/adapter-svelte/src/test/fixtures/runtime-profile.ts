export function profile(id: string) {
  return {
    id,
    stableId: id,
    random: 0.5,
    audiences: [],
    traits: {},
    location: {},
    session: {
      isReturningVisitor: false,
      landingPage: { path: '/', query: {}, referrer: '', search: '', url: 'https://example.com/' },
      count: 1,
      activeSessionLength: 0,
      averageSessionLength: 0,
    },
  };
}
