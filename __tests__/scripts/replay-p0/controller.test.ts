// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createController } from '../../../scripts/replay-p0/controller';
import type { Eligibility, SdkHandle } from '../../../scripts/replay-p0/contract';

const allowed: Eligibility = { initialized: true, auth: 'anonymous', ads: 'denied', adsEverLoaded: false, exactPublicRoute: true };
function setup(options: { ready?: DocumentReadyState; load?: () => Promise<SdkHandle>; eligibility?: Eligibility } = {}) {
  const sdk = { start: vi.fn(), stop: vi.fn(async () => undefined), flush: vi.fn(async () => undefined) };
  const deps = { load: vi.fn(options.load || (async () => sdk)), readEligibility: () => options.eligibility || allowed,
    readReadyState: () => options.ready || 'complete' as DocumentReadyState, cancelOwnedWork: vi.fn(), onCleanup: vi.fn(), now: () => Date.now() };
  return { sdk, deps, controller: createController(deps), options };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it('starts once only after all conditions are confirmed', async () => {
  const { controller, sdk } = setup(); await controller.prepare(); await controller.prepare();
  expect(controller.snapshot().phase).toBe('RECORDING'); expect(sdk.start).toHaveBeenCalledTimes(1);
});
it.each([{ auth: 'unknown' }, { auth: 'authenticated' }, { ads: 'granted' }, { initialized: false }])('does not load for forbidden input %j', async patch => {
  const { controller, deps } = setup({ eligibility: { ...allowed, ...patch } as Eligibility });
  await controller.prepare(); expect(deps.load).not.toHaveBeenCalled(); expect(controller.snapshot().phase).toBe('CLOSED');
});
it('invalidates a pending import without starting it', async () => {
  let complete!: (sdk: SdkHandle) => void;
  const { controller, sdk } = setup({ load: () => new Promise(resolve => { complete = resolve; }) });
  const pending = controller.prepare(); controller.close('ineligible'); complete(sdk); await pending;
  expect(controller.snapshot().phase).toBe('CLOSED'); expect(sdk.start).not.toHaveBeenCalled();
});
it('rechecks eligibility after DOM readiness', async () => {
  const test = setup({ ready: 'loading' }); await test.controller.prepare();
  expect(test.controller.snapshot().phase).toBe('LOADING');
  test.options.ready = 'complete'; test.options.eligibility = { ...allowed, ads: 'granted' };
  test.controller.domReady(); expect(test.controller.snapshot().phase).toBe('CLOSED'); expect(test.sdk.start).not.toHaveBeenCalled();
});
it('closes the gate before cancellation or public stop, and absorbs repeat calls', async () => {
  const { controller, deps, sdk } = setup(); const seen: string[] = [];
  deps.cancelOwnedWork.mockImplementation(() => { seen.push('cancel:' + controller.snapshot().phase); });
  sdk.stop.mockImplementation(async () => { seen.push('stop:' + controller.snapshot().phase); });
  await controller.prepare(); controller.close('hidden'); const closed = controller.snapshot();
  controller.close('sdk'); await controller.prepare(); await controller.flush(); controller.domReady();
  expect(seen).toEqual(['cancel:CLOSED', 'stop:CLOSED']); expect(controller.snapshot()).toEqual(closed);
  expect(sdk.start).toHaveBeenCalledTimes(1); expect(sdk.flush).not.toHaveBeenCalled();
});
it('handles close during the first snapshot synchronously', async () => {
  const { controller, sdk } = setup(); sdk.start.mockImplementation(() => controller.close('ineligible'));
  await controller.prepare(); expect(controller.snapshot().phase).toBe('CLOSED'); expect(sdk.stop).toHaveBeenCalledTimes(1);
});
it('closes at five minutes and keeps unresolved SDK cleanup separate', async () => {
  const { controller, sdk, deps } = setup(); sdk.stop.mockImplementation(() => new Promise(() => undefined));
  await controller.prepare(); await vi.advanceTimersByTimeAsync(299999); expect(controller.snapshot().phase).toBe('RECORDING');
  await vi.advanceTimersByTimeAsync(1); expect(controller.snapshot().phase).toBe('CLOSED');
  expect(deps.onCleanup).toHaveBeenLastCalledWith('pending');
});
