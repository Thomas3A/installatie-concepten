// Verbinding met de rekenmotor: een Web Worker in de browser, of (zonder Worker, bijv. in tests) dezelfde motor
// in de hoofdthread. De motor wordt dan pas geladen als hij nodig is, zodat de pagina zelf klein blijft.
import type { Engine, EngineRequest, EngineResponse } from './model/engine';

export type Listener = (msg: EngineResponse) => void;

export interface EngineClient {
  post: (req: EngineRequest) => void;
  dispose: () => void;
}

export function createEngineClient(listener: Listener): EngineClient {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./model/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<EngineResponse>) => listener(e.data);
      return { post: (req) => worker.postMessage(req), dispose: () => worker.terminate() };
    } catch {
      // val terug op de hoofdthread
    }
  }
  let engine: Promise<Engine> | null = null;
  let alive = true;
  return {
    post: (req) => {
      engine ??= import('./model/engine').then((m) => m.createEngine());
      void engine.then((e) => {
        if (alive) void e.handle(req, (msg) => alive && listener(msg));
      });
    },
    dispose: () => {
      alive = false;
    },
  };
}
