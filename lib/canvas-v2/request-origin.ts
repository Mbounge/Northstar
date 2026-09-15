/** Next's local proxy can reconstruct localhost URLs for requests sent to 127.0.0.1. */
export function sameNorthstarOrigin(request: Request, development = process.env.NODE_ENV === 'development'): boolean {
  const value = request.headers.get('origin');
  if (!value) return false;
  try {
    const expected = new URL(request.url), actual = new URL(value);
    if (actual.origin === expected.origin) return true;
    const loopback = (name:string) => ['localhost','127.0.0.1','[::1]'].includes(name);
    return development && loopback(expected.hostname) && loopback(actual.hostname)
      && actual.protocol === expected.protocol && actual.port === expected.port
      && actual.host === request.headers.get('host');
  } catch { return false; }
}
