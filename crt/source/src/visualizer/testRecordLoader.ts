import { getTestRecord, type TestRecord } from "./testBeat";

let loaded: TestRecord | null = null;
let pending: Promise<TestRecord> | null = null;

/** The record if it has finished synthesising, else null. */
export function peekTestRecord(): TestRecord | null {
  return loaded;
}

/** Synthesise the test record in a Web Worker (falls back to the main thread). */
export function loadTestRecord(): Promise<TestRecord> {
  if (loaded) return Promise.resolve(loaded);
  if (pending) return pending;
  pending = new Promise<TestRecord>(resolve => {
    const done = (rec: TestRecord) => {
      loaded = rec;
      resolve(rec);
    };
    try {
      const worker = new Worker(new URL("./recordWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<TestRecord>) => {
        worker.terminate();
        done(e.data);
      };
      worker.onerror = () => {
        worker.terminate();
        done(getTestRecord());
      };
      worker.postMessage(null);
    } catch {
      done(getTestRecord());
    }
  });
  return pending;
}
