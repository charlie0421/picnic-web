export function isLocalPortOneDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/' && !url.hash && !url.search;
  } catch { return false; }
}
