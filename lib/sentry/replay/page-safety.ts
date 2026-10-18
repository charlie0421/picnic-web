import { onlyPublicPreferenceCookies } from './public-cookies';
const adHost = /(^|\.)(googlesyndication\.com|doubleclick\.net|googletagservices\.com)$/;
function adResource(raw: string): boolean {
  try { return adHost.test(new URL(raw, location.origin).hostname); } catch { return true; }
}
/** Conservative local harness boundary. These are coarse checks, never forwarded as telemetry. */
export function localPageIsSafe(): boolean {
  try {
    return /(?:HeadlessChrome|Chrome)\//.test(navigator.userAgent)
      && document.documentElement.lang === 'ko' && onlyPublicPreferenceCookies(document.cookie)
      && !document.querySelector('#adsense-script,ins.adsbygoogle,iframe')
      && !('adsbygoogle' in window)
      && !Array.from(document.scripts).some(script => script.src && adResource(script.src))
      && !(performance.getEntriesByType?.('resource') ?? []).some(entry => adResource(entry.name));
  } catch { return false; }
}
