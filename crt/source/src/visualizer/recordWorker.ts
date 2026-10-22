/// <reference lib="webworker" />
import { getTestRecord } from "./testBeat";

// Synthesise the record off the main thread and hand the sample arrays back without copying.
self.onmessage = () => {
  const rec = getTestRecord();
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(rec, [rec.left.buffer, rec.right.buffer]);
};
