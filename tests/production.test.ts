import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINS, readConfigs, weightRange, type Configs } from '../lib/bins.ts';
import { createDemo } from '../lib/demo.ts';
import {
  AUTHENTICATED_DEVIATION_CHANCE, DEVIATION_INTERVAL_MS, PIECE_INTERVAL_MS,
  ProductionScheduler, SCHEDULER_INTERVAL_MS,
} from '../lib/production.ts';
import type { Repository } from '../lib/repository.ts';
import { SystemStore } from '../lib/store.ts';
import { initialSystem, simulate } from '../lib/system.ts';

const minute = 60_000;
const firstBin = BINS[0];

test('all 16 cubas receive 120 individually weighted pieces in one uninterrupted minute', () => {
  let seed = 17;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const schedule = new ProductionScheduler(0, random);
  const configs: Configs = {
    BL_06_L: { pesoAlvo: 201.5, toleranciaPorcentagem: 0 },
    BL_07_L: { pesoAlvo: 200, toleranciaPorcentagem: 5 },
    BL_08_L: { pesoAlvo: 200, toleranciaPorcentagem: 5 },
  };
  const weights = new Map(BINS.map(bin => [bin.id, new Set<number>()]));
  let state = initialSystem();
  let processed = 0;
  for (let now = 0; now <= minute; now += SCHEDULER_INTERVAL_MS) {
    const batch = schedule.takeDue(now, configs);
    assert.ok(batch.length <= 2, 'normal scheduler ticks should only process the pieces due');
    for (const piece of batch) {
      const bin = BINS.find(item => item.id === piece.binId)!;
      const { min, max } = weightRange(bin, configs[bin.id]);
      assert.equal(piece.side, bin.side);
      assert.ok(piece.weight >= min && piece.weight <= max);
      weights.get(bin.id)!.add(piece.weight);
      state = simulate(state, configs, piece);
      processed++;
    }
  }
  assert.equal(processed, 1920);
  assert.equal(state.phase, 'running');
  for (const bin of BINS) {
    assert.equal(state.bins[bin.id].totalProcessed, 120, bin.id);
    assert.equal(state.bins[bin.id].errors, 0, bin.id);
    assert.equal(weights.get(bin.id)!.size > 1, bin.id !== firstBin.id, bin.id);
  }
  assert.deepEqual([...weights.get(firstBin.id)!], [201.5]);
});

test('scheduler remains bounded after a delayed callback or a long suspension', () => {
  const schedule = new ProductionScheduler();
  schedule.takeDue(0, {});
  assert.ok(schedule.takeDue(PIECE_INTERVAL_MS - 1, {}).length <= BINS.length);
  assert.deepEqual(schedule.takeDue(3_600_000, {}), []);
  assert.ok(schedule.takeDue(3_600_000 + SCHEDULER_INTERVAL_MS, {}).length <= 2);
  schedule.reset();
  assert.deepEqual(schedule.takeDue(7_200_000, {}), []);
});

test('authenticated deviations keep the previous probability threshold and independent cadence', () => {
  function collect(value: number) {
    const schedule = new ProductionScheduler(AUTHENTICATED_DEVIATION_CHANCE, () => value);
    let failures = 0;
    for (let now = 0; now <= minute; now += SCHEDULER_INTERVAL_MS) {
      for (const piece of schedule.takeDue(now, {})) {
        const range = weightRange(BINS.find(bin => bin.id === piece.binId)!);
        assert.equal(piece.failure, piece.weight < range.min || piece.weight > range.max);
        if (piece.failure) failures++;
      }
    }
    return failures;
  }
  assert.equal(collect(0.019), Math.floor(minute / DEVIATION_INTERVAL_MS));
  assert.equal(collect(0.02), 0);
});

test('demo timer publishes one update per batch and pause, interlock and reset preserve counts', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10_000 });
  const demo = createDemo();
  const { store } = demo;
  store.start();
  try {
    store.beginSimulation();
    const count = () => Object.values(store.getSnapshot().system.bins).reduce((total, bin) => total + bin.totalProcessed, 0);
    let updates = 0;
    const unsubscribe = store.subscribe(() => { updates++; });
    for (let tick = 0; tick <= 10; tick++) t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    assert.equal(count(), 16);
    assert.equal(updates, 10);
    unsubscribe();
    store.pauseSimulation();
    t.mock.timers.tick(30_000);
    assert.equal(count(), 16);
    store.beginSimulation();
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    assert.equal(count(), 16);
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    assert.equal(count(), 17);
    demo.block();
    const blocked = store.getSnapshot().system;
    assert.equal(blocked.phase, 'interlocked');
    assert.equal(Object.values(blocked.bins).filter(bin => bin.errors === 5).length, 1);
    t.mock.timers.tick(1_000);
    assert.equal(count(), 17);
    await demo.reset();
    assert.equal(count(), 17);
    assert.equal(store.getSnapshot().simulationStarted, false);
  } finally { store.stop(); }
});

test('authenticated timer waits for authorization and stops immediately after remote block or connection loss', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10_000 });
  type WatchProduction = NonNullable<Repository['watchProduction']>;
  let receive: Parameters<WatchProduction>[0] = () => {};
  let fail: Parameters<WatchProduction>[1] = () => {};
  let confirm = () => {};
  let currentLease: string | null = null;
  const repo: Repository = {
    watchConfigs(next) { next(readConfigs([])); return () => {}; },
    watchProduction(next, error) {
      receive = next;
      fail = error;
      receive('OPERACIONAL', 'initial', undefined, { revision: '1', leaseId: null });
      return () => {};
    },
    async saveConfig() {},
    async persist() { assert.fail('A remote block must not create a duplicate stop'); },
    async changeLease(action, id) {
      if (action !== 'acquire') return;
      await new Promise<void>(resolve => { confirm = resolve; });
      currentLease = id;
      receive('OPERACIONAL', 'initial', undefined, { revision: '1', leaseId: id });
    },
  };
  const store = new SystemStore(repo, undefined, undefined, AUTHENTICATED_DEVIATION_CHANCE);
  const count = () => Object.values(store.getSnapshot().system.bins).reduce((total, bin) => total + bin.totalProcessed, 0);
  store.start();
  try {
    const start = store.beginSimulation();
    await Promise.resolve();
    t.mock.timers.tick(200);
    assert.equal(count(), 0);
    confirm();
    await start;
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    assert.equal(count(), 1);
    fail(new Error('offline'));
    t.mock.timers.tick(1_000);
    assert.equal(count(), 1);
    receive('OPERACIONAL', 'initial', undefined, { revision: '1', leaseId: currentLease });
    t.mock.timers.tick(1_000);
    assert.equal(count(), 1);

    const restart = store.beginSimulation();
    await new Promise(resolve => setImmediate(resolve));
    confirm();
    await restart;
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    t.mock.timers.tick(SCHEDULER_INTERVAL_MS);
    assert.equal(count(), 2);
    receive('BLOQUEADO', 'initial', 'Bloqueio remoto', { revision: '2', leaseId: null });
    t.mock.timers.tick(1_000);
    assert.equal(count(), 2);
    assert.equal(store.getSnapshot().simulationStarted, false);
  } finally { store.stop(); }
});
