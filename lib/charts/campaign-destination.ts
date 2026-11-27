/** Attribution is opt-in for both the viewer and the campaign destination.
 * The receiving checkout reads the fragment and returns the token with the
 * settled order. Browsers omit fragments from HTTP requests and referrers.
 */
export function attributedDestination(destination: string, trustedOrigins: string, token: string): string {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token)) return destination;
    try {
        const url = new URL(destination);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.hash ||
            !trustedOrigins
                .split(',')
                .map((s) => s.trim())
                .includes(url.origin)
        )
            return destination;
        url.hash = new URLSearchParams({ picnic_click: token }).toString();
        return url.toString();
    } catch {
        return destination;
    }
}
