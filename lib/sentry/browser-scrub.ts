import type { Breadcrumb, Event } from '@sentry/core';
import { scrubEvent, TRIPWIRE_KEY } from './scrub';

/** The SDK shares console args and fetch data with the application. Copy the containers we scrub. */
function copyBreadcrumb(input: Breadcrumb): Breadcrumb {
  const seen = new WeakMap<object, object>();
  let count = 0;
  function copy(value: unknown, depth: number): unknown {
    if (++count > 10000 || depth > 40) throw new Error('breadcrumb limits');
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const proto = Object.getPrototypeOf(value);
    // scrubEvent also leaves opaque objects intact; SDK normalization handles them later.
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
    if (Array.isArray(value) && value.length > 10000) throw new Error('breadcrumb limits');
    const result = Array.isArray(value) ? [] : Object.create(null);
    seen.set(value, result);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      Object.defineProperty(result, key, {
        value: descriptor && 'value' in descriptor ? copy(descriptor.value, depth + 1) : '[Getter]',
        enumerable: true, configurable: true, writable: true,
      });
    }
    return result;
  }
  return copy(input, 0) as Breadcrumb;
}

export function scrubBrowserBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    const copy = copyBreadcrumb(breadcrumb);
    if (copy.category === 'navigation' && copy.data) {
      for (const key of ['from', 'to']) {
        const value = copy.data[key];
        if (typeof value === 'string') copy.data[key] = value.split(/[?#]/, 1)[0];
      }
    }
    const clean = scrubEvent(copy) as (Breadcrumb & { tags?: Record<string, string> }) | null;
    if (clean?.tags?.[TRIPWIRE_KEY] === '1') {
      clean.data = { ...clean.data, [TRIPWIRE_KEY]: '1' };
      delete clean.tags[TRIPWIRE_KEY];
      if (!Object.keys(clean.tags).length) delete clean.tags;
    }
    return clean;
  } catch {
    return null;
  }
}

export function scrubBrowserEvent<T extends Event>(event: T): T | null {
  if (event.breadcrumbs?.some((breadcrumb) => breadcrumb.data?.[TRIPWIRE_KEY] === '1')) {
    event.tags = { ...event.tags, [TRIPWIRE_KEY]: '1' };
  }
  return scrubEvent(event);
}
