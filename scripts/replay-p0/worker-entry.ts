import { projectEnvelope } from './projection';

const worker = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage(value: unknown, transfer: Transferable[]): void;
};
worker.onmessage = async event => {
  const { id, input, state } = event.data;
  const result = await projectEnvelope(input, state);
  worker.postMessage({ id, result }, result.ok ? [result.value.bytes.buffer] : []);
};
