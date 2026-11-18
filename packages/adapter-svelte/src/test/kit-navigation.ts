interface Navigation {
  from: { url: URL } | null;
  to: { url: URL } | null;
}

/** Package component tests supply committed navigation; applications use Kit's public module. */
export const navigationHooks = {
  after: new Set<(navigation: Navigation) => void>(),
  reset() {
    this.after.clear();
  },
};
export function afterNavigate(callback: (navigation: Navigation) => void): void {
  navigationHooks.after.add(callback);
}
export async function goto(_path: string): Promise<void> {}
