import { afterEach, expect, it, vi } from 'vitest';
import { localPageIsSafe } from '@/lib/sentry/replay/page-safety';
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; document.head.innerHTML = ''; document.documentElement.lang = ''; delete (window as any).adsbygoogle; });
function supported() { document.documentElement.lang = 'ko'; vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('HeadlessChrome/153.0'); }
it('requires the known engine and Korean document', () => { expect(localPageIsSafe()).toBe(false); supported(); expect(localPageIsSafe()).toBe(true); });
it.each(['<iframe></iframe>', '<ins class="adsbygoogle"></ins>', '<script id="adsense-script"></script>', '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>'])('rejects existing ad surfaces %s', html => { supported(); document.body.innerHTML = html; expect(localPageIsSafe()).toBe(false); });
it('rejects prior ad execution even if the script was removed', () => { supported(); (window as any).adsbygoogle = []; expect(localPageIsSafe()).toBe(false); });

it('allows only the product language preference cookie', () => { supported(); document.cookie = 'locale=en'; expect(localPageIsSafe()).toBe(true); document.cookie = 'locale=; max-age=0'; });
