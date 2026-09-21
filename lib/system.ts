import { BINS, weightRange, type BinId, type Configs } from './bins.ts';

export const MAX_ALLOWED_ERRORS = 5;
export const ERROR_WINDOW_MS = 2 * 60 * 1000;
export const SIMULATION_INTERVAL_MS = 342;
export type Phase = 'running' | 'jammed' | 'interlocked';
export type BinState = { totalProcessed: number; lastWeight: number; errors: number; errorTimestamps: number[] };
export type Stop = { id: string; type: 'JAM' | 'INTERLOCK'; reason: string; startedAt: number };
export type SystemState = {
  bins: Record<BinId, BinState>;
  phase: Phase;
  stop: Stop | null;
  downtimeSeconds: number;
};
export type Sample = { weight: number; side: 'L' | 'R'; jam: boolean; failure: boolean; now: number; eventId: string; binId?: BinId };

export function initialSystem(): SystemState {
  return {
    bins: Object.fromEntries(BINS.map(bin => [bin.id, { totalProcessed: 0, lastWeight: 0, errors: 0, errorTimestamps: [] as number[] }])) as Record<BinId, BinState>,
    phase: 'running', stop: null, downtimeSeconds: 0,
  };
}

export function updateDowntime(state: SystemState, now: number): SystemState {
  if (!state.stop) return state;
  const downtimeSeconds = Math.max(0, Math.floor((now - state.stop.startedAt) / 1000));
  return downtimeSeconds === state.downtimeSeconds ? state : { ...state, downtimeSeconds };
}

export function simulate(state: SystemState, configs: Configs, sample: Sample): SystemState {
  if (state.phase !== 'running') return updateDowntime(state, sample.now);
  if (sample.jam) return {
    ...state, phase: 'jammed', downtimeSeconds: 0,
    stop: { id: sample.eventId, type: 'JAM', reason: 'Acúmulo de produto na calha principal', startedAt: sample.now },
  };
  let current = state;
  for (const bin of BINS) {
    const previous = current.bins[bin.id];
    const errorTimestamps = previous.errorTimestamps.filter(time => sample.now - time <= ERROR_WINDOW_MS);
    if (errorTimestamps.length !== previous.errorTimestamps.length) {
      current = { ...current, bins: { ...current.bins, [bin.id]: { ...previous, errorTimestamps, errors: errorTimestamps.length } } };
    }
  }
  const matches = BINS.filter(bin => {
    const range = weightRange(bin, configs[bin.id]);
    return bin.side === sample.side && sample.weight >= range.min && sample.weight <= range.max;
  });
  const target = sample.binId
    ? BINS.find(bin => bin.id === sample.binId && bin.side === sample.side)
    : sample.failure
      ? BINS.find(bin => bin.side === sample.side && !matches.includes(bin))
      : matches.at(-1);
  if (!target) return current;
  const range = weightRange(target, configs[target.id]);
  const outsideRange = sample.weight < range.min || sample.weight > range.max;
  const previous = current.bins[target.id];
  const errorTimestamps = outsideRange ? [...previous.errorTimestamps, sample.now] : previous.errorTimestamps;
  const bin = { ...previous, errors: errorTimestamps.length, errorTimestamps,
    totalProcessed: previous.totalProcessed + (outsideRange ? 0 : 1), lastWeight: sample.weight };
  const next = { ...current, bins: { ...current.bins, [target.id]: bin } };
  if (bin.errors < MAX_ALLOWED_ERRORS) return next;
  return {
    ...next, phase: 'interlocked', downtimeSeconds: 0,
    stop: { id: sample.eventId, type: 'INTERLOCK', reason: `${target.label} — Lado ${target.sideName}: 5 peças fora do peso em 2 minutos. Último peso: ${sample.weight}g; faixa: ${range.min.toFixed(2)}g a ${range.max.toFixed(2)}g.`, startedAt: sample.now },
  };
}

export function resetSystem(state: SystemState): SystemState {
  return {
    ...initialSystem(),
    bins: Object.fromEntries(BINS.map(bin => [bin.id, {
      totalProcessed: state.bins[bin.id].totalProcessed, lastWeight: 0, errors: 0, errorTimestamps: [] as number[],
    }])) as Record<BinId, BinState>,
  };
}
