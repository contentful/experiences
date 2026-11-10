/** Replaces document.cookie with a jar to read from and a log of everything written. */
export function captureCookieWrites(jar = ''): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => jar,
    set: (value: string) => {
      writes.push(value);
    },
  });
  return {
    writes,
    restore: () => {
      Reflect.deleteProperty(document, 'cookie');
      Object.defineProperty(Document.prototype, 'cookie', descriptor);
    },
  };
}
