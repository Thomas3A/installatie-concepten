// Web Worker-entry (spec §7.4): postMessage met request-id; de rekenmotor staat in engine.ts.
import { createEngine, type EngineRequest, type EngineResponse } from './engine';

interface WorkerScope {
  onmessage: ((e: MessageEvent<EngineRequest>) => void) | null;
  postMessage: (msg: EngineResponse, transfer?: Transferable[]) => void;
}

const scope = self as unknown as WorkerScope;
const engine = createEngine();

scope.onmessage = (e) => {
  void engine.handle(e.data, (msg, transfer) => scope.postMessage(msg, transfer ?? []));
};
