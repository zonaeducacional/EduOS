import { TimetableCspSolver } from './solver/cspSolver';
import type { ProjetoHorario } from './shared/types';

self.onmessage = (event: MessageEvent<ProjetoHorario>) => {
  const result = new TimetableCspSolver(event.data, (progress) => {
    self.postMessage({ progress: progress.etapa });
  }, { maxTimeMs: 30_000 }).solve();
  self.postMessage({ result });
};
