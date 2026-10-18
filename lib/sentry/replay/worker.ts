import { projectWithContract } from '@/scripts/replay-p0/engine/envelope';
import { createVoteListContract, type VoteListManifest } from '@/scripts/replay-p0/contracts/vote-list';
import manifest from '@/scripts/replay-p0/contracts/vote-list.css-manifest.json';
const worker = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage(value: unknown, transfer: Transferable[]): void };
worker.onmessage = async event => {
  const { id, input, state, origin, bannerCount } = event.data;
  try {
    const contract = createVoteListContract({ manifest: manifest as VoteListManifest, origin, bannerCount });
    const result = await projectWithContract(input, state, contract);
    worker.postMessage({ id, result }, result.ok ? [result.value.bytes.buffer] : []);
  } catch { worker.postMessage({ id, result: { ok: false, reason: 'schema' } }, []); }
};
