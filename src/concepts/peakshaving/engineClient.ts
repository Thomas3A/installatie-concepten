// Verbinding met de rekenmotor: een Web Worker in de browser, of (zonder Worker, bijv. in tests) dezelfde motor
// in de hoofdthread. De motor wordt dan pas geladen als hij nodig is, zodat de pagina zelf klein blijft.
// Valt de Worker uit (module niet te laden, crash), dan rekent de hoofdthread verder met de openstaande verzoeken.
import type { Engine, EngineRequest, EngineResponse } from './model/engine';

export type Listener = (msg: EngineResponse) => void;

export interface EngineClient {
  post: (req: EngineRequest) => void;
  dispose: () => void;
}

export interface EngineClientOptions {
  /** geen Worker gebruiken, ook niet als die beschikbaar is */
  mainThread?: boolean;
  /** rekenmotor voor de hoofdthread (tests: bijv. met een vertraagde of falende loader voor de werkelijke jaren) */
  createEngine?: () => Engine | Promise<Engine>;
}

const loadEngine = (): Promise<Engine> => import('./model/engine').then((m) => m.createEngine());

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Motor in de hoofdthread; een mislukte (dynamische) import geeft een foutmelding en wordt later opnieuw geprobeerd. */
function mainThreadClient(listener: Listener, make: () => Engine | Promise<Engine>): EngineClient {
  let engine: Promise<Engine> | null = null;
  let alive = true;
  return {
    post: (req) => {
      engine ??= Promise.resolve()
        .then(make)
        .catch((e: unknown) => {
          engine = null;
          throw e;
        });
      engine.then(
        (e) => {
          if (alive) void e.handle(req, (msg) => alive && listener(msg));
        },
        (e: unknown) => {
          if (alive)
            listener({ type: 'error', id: req.id, message: `rekenmotor niet geladen (${errorText(e)})` });
        },
      );
    },
    dispose: () => {
      alive = false;
    },
  };
}

export function createEngineClient(listener: Listener, options: EngineClientOptions = {}): EngineClient {
  const make = options.createEngine ?? loadEngine;
  if (!options.mainThread && typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./model/worker.ts', import.meta.url), { type: 'module' });
      // nog niet (volledig) beantwoorde verzoeken: bij uitval van de Worker opnieuw versturen
      let openAnalyze: EngineRequest | null = null;
      let openSensitivity: EngineRequest | null = null;
      const remember = (req: EngineRequest): void => {
        if (req.type === 'analyze') openAnalyze = req;
        else openSensitivity = req;
      };
      const receive: Listener = (msg) => {
        const finished = msg.type === 'analysis' || msg.type === 'sensitivity-done' || msg.type === 'error';
        if (finished && openAnalyze?.id === msg.id) openAnalyze = null;
        if (finished && openSensitivity?.id === msg.id) openSensitivity = null;
        listener(msg);
      };
      let fallback: EngineClient | null = null;
      const switchToMainThread = (reason: string): void => {
        if (fallback) return;
        console.warn(`Rekenmotor: Worker uitgevallen (${reason}); verder in de hoofdthread.`);
        worker.terminate();
        fallback = mainThreadClient(receive, make);
        for (const req of [openAnalyze, openSensitivity]) if (req) fallback.post(req);
      };
      worker.onmessage = (e: MessageEvent<EngineResponse>) => {
        if (!fallback) receive(e.data);
      };
      worker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        switchToMainThread(e.message || 'laden mislukt');
      };
      worker.onmessageerror = () => switchToMainThread('bericht niet te lezen');
      return {
        post: (req) => {
          remember(req);
          if (fallback) fallback.post(req);
          else worker.postMessage(req);
        },
        dispose: () => {
          worker.terminate();
          fallback?.dispose();
        },
      };
    } catch {
      // val terug op de hoofdthread
    }
  }
  return mainThreadClient(listener, make);
}
