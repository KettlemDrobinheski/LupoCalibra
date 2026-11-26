import { BINS, weightRange, type Configs } from './bins.ts';
import type { Sample } from './system.ts';

export const PIECE_INTERVAL_MS = 500;
export const SCHEDULER_INTERVAL_MS = 50;
export const AUTHENTICATED_DEVIATION_CHANCE = 0.02;
// Mantém a cadência de sorteio da linha anterior, independentemente da vazão por cuba.
export const DEVIATION_INTERVAL_MS = 342;

type Range = ReturnType<typeof weightRange>;

function inRangeWeight(range: Range, random: () => number) {
  const max = Math.min(Number.MAX_VALUE, range.max);
  const { min } = range;
  if (min === max) return min;
  if (Number.isSafeInteger(min) && Number.isSafeInteger(max)) {
    return Math.min(max, min + Math.floor(random() * (max - min + 1)));
  }
  const weight = min + random() * (max - min);
  return max - min < 0.01 ? weight : Math.min(max, Math.max(min, Number(weight.toFixed(2))));
}

export function outOfRangeWeight({ min, max }: Range) {
  if (min > 0) return Math.floor(min / 2);
  // Se toda leitura positiva cabe na faixa, representa uma leitura de sensor inválida.
  const above = max * 2;
  return Number.isFinite(above) && above > max ? above : -1;
}

export class ProductionScheduler {
  private due: { bin: typeof BINS[number]; at: number }[] = [];
  private lastTick?: number;
  private nextDeviation = 0;
  private deviationPending = false;
  private deviationChance: number;
  private random: () => number;

  constructor(deviationChance = 0, random = Math.random) {
    this.deviationChance = deviationChance;
    this.random = random;
  }

  reset() {
    this.due = [];
    this.lastTick = undefined;
    this.deviationPending = false;
  }

  takeDue(now: number, configs: Configs): Sample[] {
    if (this.lastTick === undefined || now < this.lastTick || now - this.lastTick >= PIECE_INTERVAL_MS) {
      // Recomeça após pausa ou suspensão e distribui as chegadas ao longo do ciclo.
      this.due = BINS.map((bin, index) => ({ bin, at: now + PIECE_INTERVAL_MS * (index + 1) / BINS.length }));
      this.nextDeviation = now + DEVIATION_INTERVAL_MS;
      this.deviationPending = false;
    }
    this.lastTick = now;

    if (this.deviationChance > 0 && now >= this.nextDeviation) {
      this.deviationPending ||= this.random() < this.deviationChance;
      this.nextDeviation += DEVIATION_INTERVAL_MS * (1 + Math.floor((now - this.nextDeviation) / DEVIATION_INTERVAL_MS));
    }

    const samples: Sample[] = [];
    // A lista gira por ordem de chegada, inclusive quando um lote cruza o fim do ciclo.
    while (this.due[0].at <= now) {
      const next = this.due.shift()!;
      const { bin } = next;
      const range = weightRange(bin, configs[bin.id]);
      const failure = this.deviationPending;
      this.deviationPending = false;
      samples.push({
        weight: failure ? outOfRangeWeight(range) : inRangeWeight(range, this.random),
        side: bin.side, binId: bin.id, jam: false, failure, now, eventId: crypto.randomUUID(),
      });
      next.at += PIECE_INTERVAL_MS;
      this.due.push(next);
    }
    return samples;
  }
}
