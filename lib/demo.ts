import { BINS, weightRange, type Configs } from './bins.ts';
import type { Repository } from './repository.ts';
import { outOfRangeWeight } from './production.ts';
import { SystemStore } from './store.ts';
import { MAX_ALLOWED_ERRORS } from './system.ts';

export function createDemo() {
  const configs: Configs = {};
  const memory: Repository = {
    watchConfigs(receive) {
      receive({ configs: { ...configs }, unknownIds: [], invalidIds: [] });
      return () => {};
    },
    async saveConfig(id, config) {
      configs[id] = { ...config };
    },
    async persist() {
      // O resultado da simulação já está na store desta aba.
    },
  };
  const store = new SystemStore(memory);
  return {
    store,
    block() {
      const { system, configs, resetting, simulationStarted } = store.getSnapshot();
      if (!simulationStarted || resetting || system.phase !== 'running') return;
      // Escolhe a balança com menos falhas recentes para mostrar a regra completa sempre que possível.
      const bin = BINS.reduce((selected, candidate) =>
        system.bins[candidate.id].errors < system.bins[selected.id].errors ? candidate : selected);
      const weight = outOfRangeWeight(weightRange(bin, configs[bin.id]));
      const now = Date.now();
      for (let index = 0; index < MAX_ALLOWED_ERRORS && store.getSnapshot().system.phase === 'running'; index++) {
        store.tick({ weight, side: bin.side, binId: bin.id, jam: false, failure: true, now, eventId: crypto.randomUUID() });
      }
    },
    async reset() {
      await store.reset();
      store.pauseSimulation();
    },
  };
}
