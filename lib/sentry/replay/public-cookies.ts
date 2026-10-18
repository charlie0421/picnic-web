/** Only the product's finite language preference is unrelated to authentication. Unknown cookies deny recording. */
export function onlyPublicPreferenceCookies(header: string | null): boolean {
  return !header || /^locale=(?:ko|en|ja|zh-cn|zh-tw|id|es|bn|tl|th|vi|my)$/.test(header.trim());
}
