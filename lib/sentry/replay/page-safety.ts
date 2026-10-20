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

/** Compatibility evidence, not a spoof-resistant identity check. Unknown browsers fail closed. */
export function diagnosticPageIsSafe(win: Window): boolean {
  try {
    const ua = win.navigator.userAgent;
    const data = (win.navigator as Navigator & { userAgentData?: { brands: {brand: string}[]; mobile: boolean; platform: string } }).userAgentData;
    if (win.location.href !== 'https://www.picnic.fan/ko/vote' || !/Chrome\//.test(ua)
      || /Edge|Edg\/|Whale|OPR\/|Opera|SamsungBrowser|CriOS|YaBrowser|HeadlessChrome|Android|iPhone|iPad/i.test(ua)
      || !data || data.mobile !== false || !['Windows', 'macOS', 'Linux', 'Chrome OS'].includes(data.platform)
      || !Array.isArray(data.brands) || !data.brands.some(item => item.brand === 'Google Chrome')) return false;
    const ad = (raw: string) => adHost.test(new URL(raw, win.location.origin).hostname);
    return win.document.documentElement.lang === 'ko' && onlyPublicPreferenceCookies(win.document.cookie)
      && !win.document.querySelector('#adsense-script,ins.adsbygoogle,iframe') && !Reflect.has(win, 'adsbygoogle')
      && !Array.from(win.document.scripts).some(script => script.src && ad(script.src))
      && !(win.performance.getEntriesByType?.('resource') ?? []).some(entry => ad(entry.name));
  } catch { return false; }
}
