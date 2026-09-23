import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINS, defaultConfig, isValidConfig, readConfigs, weightRange } from '../lib/bins.ts';
import { ERROR_WINDOW_MS, initialSystem, resetSystem, simulate, updateDowntime, type Sample } from '../lib/system.ts';
import { SystemStore } from '../lib/store.ts';
import type { Repository, ConfigurationResult } from '../lib/repository.ts';

const piece: Sample = { weight: 170, side: 'L', jam: false, failure: false, now: 1000, eventId: 'test-stop' };

test('16 unique canonical BLs, with original ranges and both sides', () => {
  assert.equal(BINS.length, 16);
  assert.equal(new Set(BINS.map(bin => bin.id)).size, 16);
  for (const bin of BINS) {
    const range = weightRange(bin, defaultConfig(bin));
    assert.ok(Math.abs(range.min - bin.minWeight) < 0.000001);
    assert.ok(Math.abs(range.max - bin.maxWeight) < 0.000001);
    const state = simulate(initialSystem(), {}, { ...piece, weight: bin.minWeight, side: bin.side });
    assert.equal(state.bins[bin.id].totalProcessed, 1);
  }
});

test('cloud settings apply to classification, including zero tolerance', () => {
  const configs = { BL_06_L: { pesoAlvo: 150, toleranciaPorcentagem: 0 } };
  const state = simulate(initialSystem(), configs, { ...piece, weight: 150 });
  assert.equal(state.bins.BL_06_L.totalProcessed, 1);
  assert.equal(simulate(state, configs, piece).bins.BL_06_L.totalProcessed, 1);
  assert.equal(isValidConfig(configs.BL_06_L), true);
  for (const value of [null, { pesoAlvo: 0, toleranciaPorcentagem: 10 }, { pesoAlvo: 100, toleranciaPorcentagem: -1 }, { pesoAlvo: Infinity, toleranciaPorcentagem: 0 }, { pesoAlvo: 100, toleranciaPorcentagem: 101 }]) {
    assert.equal(isValidConfig(value), false);
  }
});

test('overlap preserves last matching BL and never crosses sides', () => {
  const state = simulate(initialSystem(), { BL_07_L: { pesoAlvo: 170, toleranciaPorcentagem: 0 } }, piece);
  assert.equal(state.bins.BL_06_L.totalProcessed, 0);
  assert.equal(state.bins.BL_07_L.totalProcessed, 1);
  assert.equal(state.bins.BL_07_R.totalProcessed, 0);
});

test('fifth out-of-range piece interlocks and identifies the receiving bin; reset retains good counts', () => {
  let state = simulate(initialSystem(), {}, piece);
  for (let i = 0; i < 5; i++) state = simulate(state, {}, { ...piece, weight: 190, binId: 'BL_06_L' });
  assert.equal(state.phase, 'interlocked');
  assert.equal(state.bins.BL_06_L.errors, 5);
  assert.match(state.stop!.reason, /BL_06.*Esquerdo.*5 peças fora do peso em 2 minutos/);
  const stopped = simulate(state, {}, { ...piece, now: 4500 });
  assert.equal(stopped.bins.BL_06_L.totalProcessed, 1);
  assert.equal(stopped.downtimeSeconds, 3);
  const reset = resetSystem(stopped);
  assert.equal(reset.phase, 'running');
  assert.equal(reset.stop, null);
  assert.equal(reset.downtimeSeconds, 0);
  assert.deepEqual(reset.bins.BL_06_L, { totalProcessed: 1, errors: 0, lastWeight: 0, errorTimestamps: [] });
  assert.equal(simulate(reset, {}, piece).bins.BL_06_L.totalProcessed, 2);
});

test('jam duration uses elapsed time, even when timer callbacks are delayed', () => {
  const state = simulate(initialSystem(), {}, { ...piece, jam: true });
  assert.equal(state.phase, 'jammed');
  assert.equal(updateDowntime(state, 32000).downtimeSeconds, 31);
});

test('weight failures expire after two minutes and do not accumulate across bins or sides', () => {
  const wrong: Sample = { ...piece, binId: 'BL_06_L', weight: 190 };
  let state = initialSystem();
  for (let i = 0; i < 4; i++) state = simulate(state, {}, { ...wrong, now: 1000 + i });
  state = simulate(state, {}, { ...wrong, now: 1004, side: 'R', binId: 'BL_06_R' });
  assert.equal(state.phase, 'running');
  assert.equal(state.bins.BL_06_L.errors, 4);
  assert.equal(state.bins.BL_06_R.errors, 1);
  state = simulate(state, {}, { ...wrong, now: 1004 + ERROR_WINDOW_MS });
  assert.equal(state.phase, 'running');
  assert.equal(state.bins.BL_06_L.errors, 1);
  state = simulate(state, {}, { ...piece, now: 1005 + 2 * ERROR_WINDOW_MS });
  assert.equal(state.bins.BL_06_L.errors, 0);
  assert.equal(state.bins.BL_06_R.errors, 0);
});

test('two-minute boundary is inclusive, valid pieces do not erase recent failures, reset starts a fresh window', () => {
  const wrong: Sample = { ...piece, binId: 'BL_06_L', weight: 190, now: 0 };
  let state = initialSystem();
  for (let i = 0; i < 4; i++) state = simulate(state, {}, { ...wrong, now: i });
  state = simulate(state, {}, { ...piece, now: 500 });
  assert.equal(state.bins.BL_06_L.errors, 4);
  state = simulate(state, {}, { ...wrong, now: ERROR_WINDOW_MS });
  assert.equal(state.phase, 'interlocked');
  state = resetSystem(state);
  state = simulate(state, {}, { ...wrong, now: ERROR_WINDOW_MS + 1 });
  assert.equal(state.phase, 'running');
  assert.equal(state.bins.BL_06_L.errors, 1);
  assert.equal(state.bins.BL_06_L.totalProcessed, 1);
});

test('actual receiving bin is checked against its configured range including zero tolerance', () => {
  const configs = { BL_06_L: { pesoAlvo: 170, toleranciaPorcentagem: 0 } };
  let state = simulate(initialSystem(), configs, { ...piece, binId: 'BL_06_L' });
  assert.equal(state.bins.BL_06_L.errors, 0);
  state = simulate(state, configs, { ...piece, binId: 'BL_06_L', weight: 170.01 });
  assert.equal(state.bins.BL_06_L.errors, 1);
  assert.equal(state.bins.BL_06_L.lastWeight, 170.01);
});

test('legacy and invalid IDs are flagged without guessing or rewriting documents', () => {
  const result = readConfigs([
    { id: '1_L', data: { pesoAlvo: 150, toleranciaPorcentagem: 0 } },
    { id: 'BL_06_L', data: { pesoAlvo: 170, toleranciaPorcentagem: 0 } },
    { id: 'BL_07_L', data: { pesoAlvo: -1, toleranciaPorcentagem: 10 } },
  ]);
  assert.deepEqual(result.unknownIds, ['1_L']);
  assert.deepEqual(result.invalidIds, ['BL_07_L']);
  assert.deepEqual(Object.keys(result.configs), ['BL_06_L']);
});

function fakeRepository() {
  let receive: (result: ConfigurationResult) => void = () => {};
  let fail: (error: Error) => void = () => {};
  let unsubscriptions = 0;
  const writes: boolean[] = [];
  const repo: Repository = {
    watchConfigs(next, error) { receive = next; fail = error; next(readConfigs([])); return () => { unsubscriptions++; }; },
    async saveConfig() {},
    async persist(_state, reset) { writes.push(reset); },
  };
  return { repo, writes, receive: (result: ConfigurationResult) => receive(result), fail: (error: Error) => fail(error), unsubscribed: () => unsubscriptions };
}

test('manual pause preserves weights, counts, settings and recent failures until resume', () => {
  const fake = fakeRepository();
  const store = new SystemStore(fake.repo);
  store.start();
  try {
    store.beginSimulation();
    store.tick(piece);
    for (let i = 0; i < 4; i++) store.tick({ ...piece, weight: 190, binId: 'BL_06_L' });
    const before = store.getSnapshot();
    store.pauseSimulation();
    store.pauseSimulation();
    store.tick(piece);
    assert.equal(store.getSnapshot().simulationPaused, true);
    assert.equal(store.getSnapshot().simulationStarted, false);
    assert.equal(store.getSnapshot().system, before.system);
    assert.equal(store.getSnapshot().configs, before.configs);
    assert.deepEqual(fake.writes, []);
    store.beginSimulation();
    assert.equal(store.getSnapshot().simulationPaused, false);
    store.tick({ ...piece, weight: 190, binId: 'BL_06_L', now: 2000 });
    assert.equal(store.getSnapshot().system.phase, 'interlocked');
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
    store.pauseSimulation();
    assert.equal(store.getSnapshot().simulationPaused, false);
    assert.equal(store.getSnapshot().system.phase, 'interlocked');
  } finally { store.stop(); }
});

test('manual pause requires an active operator and resume expires failures older than two minutes', () => {
  const fake = fakeRepository();
  let operator = true;
  const store = new SystemStore(fake.repo, () => operator);
  store.start();
  try {
    store.beginSimulation();
    store.tick({ ...piece, weight: 190, binId: 'BL_06_L' });
    operator = false;
    store.pauseSimulation();
    assert.equal(store.getSnapshot().simulationStarted, true);
    operator = true;
    store.pauseSimulation();
    store.beginSimulation();
    store.tick({ ...piece, now: piece.now + ERROR_WINDOW_MS + 1 });
    assert.equal(store.getSnapshot().system.bins.BL_06_L.errors, 0);
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
  } finally { store.stop(); }
});

test('simulation waits for an explicit operator command and repeated starts preserve counts', () => {
  const fake = fakeRepository();
  const store = new SystemStore(fake.repo);
  store.start();
  try {
    store.tick(piece);
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 0);
    assert.equal(store.getSnapshot().simulationStarted, false);
    store.beginSimulation();
    store.tick(piece);
    store.beginSimulation();
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
    store.start();
    store.tick(piece);
    assert.equal(store.getSnapshot().simulationStarted, false);
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
  } finally { store.stop(); }
});

test('start is denied for administrators, invalid settings and a saved alarm', () => {
  const fake = fakeRepository();
  let operator = false;
  let receive: (status: string) => void = () => {};
  fake.repo.watchProduction = next => { receive = next; next('OPERACIONAL'); return () => {}; };
  const store = new SystemStore(fake.repo, () => operator);
  store.start();
  try {
    store.beginSimulation();
    assert.equal(store.getSnapshot().simulationStarted, false);
    operator = true;
    fake.fail(new Error('offline'));
    store.beginSimulation();
    assert.equal(store.getSnapshot().simulationStarted, false);
    fake.receive(readConfigs([]));
    receive('JAMMED');
    store.beginSimulation();
    assert.equal(store.getSnapshot().simulationStarted, false);
    receive('OPERACIONAL');
    store.beginSimulation();
    assert.equal(store.getSnapshot().simulationStarted, true);
  } finally { store.stop(); }
});

test('store cleans up its listener, pauses on config errors and applies live settings', async () => {
  const fake = fakeRepository();
  const store = new SystemStore(fake.repo);
  store.start();
  store.beginSimulation();
  try {
    fake.receive(readConfigs([{ id: 'BL_06_L', data: { pesoAlvo: 150, toleranciaPorcentagem: 0 } }]));
    store.tick({ ...piece, weight: 150 });
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
    fake.fail(new Error('permission-denied'));
    store.tick({ ...piece, weight: 150 });
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
    assert.match(store.getSnapshot().configError, /permission-denied/);
    store.start();
  store.beginSimulation();
    assert.equal(fake.unsubscribed(), 1);
    await store.saveConfig('BL_06_L', { pesoAlvo: 170, toleranciaPorcentagem: 0 });
    assert.equal(store.getSnapshot().configs.BL_06_L?.pesoAlvo, 170);
  } finally { store.stop(); }
  assert.equal(fake.unsubscribed(), 2);
});

test('double reset writes once, blocks simulation while pending and preserves state on failure', async () => {
  const fake = fakeRepository();
  const store = new SystemStore(fake.repo);
  let rejectWrite: (error: Error) => void = () => {};
  fake.repo.persist = (_state, reset) => {
    fake.writes.push(reset);
    return new Promise<void>((_resolve, reject) => { rejectWrite = reject; });
  };
  store.start();
  store.beginSimulation();
  try {
    store.tick(piece);
    const before = store.getSnapshot().system;
    const first = store.reset();
    await store.reset();
    store.tick(piece);
    assert.equal(store.getSnapshot().resetting, true);
    assert.equal(store.getSnapshot().system, before);
    assert.deepEqual(fake.writes, [true]);
    rejectWrite(new Error('offline'));
    await first;
    assert.equal(store.getSnapshot().resetting, false);
    assert.equal(store.getSnapshot().system, before);
    assert.match(store.getSnapshot().syncError, /offline/);
    fake.repo.persist = async () => {};
    await store.reset();
    assert.deepEqual(store.getSnapshot().system.bins.BL_06_L, { totalProcessed: 1, errors: 0, lastWeight: 0, errorTimestamps: [] });
  } finally { store.stop(); }
});

test('stop persistence is ordered before reset and failures remain visible', async () => {
  const fake = fakeRepository();
  const store = new SystemStore(fake.repo);
  store.start();
  store.beginSimulation();
  try {
    store.tick({ ...piece, jam: true });
    await store.reset();
    assert.deepEqual(fake.writes, [false, true]);
    assert.equal(store.getSnapshot().system.phase, 'running');
    fake.repo.persist = async () => { throw new Error('permission-denied'); };
    store.tick({ ...piece, jam: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.getSnapshot().system.phase, 'jammed');
    assert.match(store.getSnapshot().syncError, /permission-denied/);
  } finally { store.stop(); }
});

test('operator reset preserves alarm while pending or rejected and clears it only after confirmation', async () => {
  let receive: (status: string, token?: string, reason?: string) => void = () => {};
  let resolveWrite: () => void = () => {};
  let rejectWrite: (error: Error) => void = () => {};
  let writes = 0;
  const repo: Repository = {
    watchConfigs(next) { next(readConfigs([])); return () => {}; },
    watchProduction(next) { receive = next; next('JAMMED', undefined, 'Parada anterior'); return () => {}; },
    async saveConfig() {},
    persist(_state, reset) {
      assert.equal(reset, true);
      writes++;
      return new Promise<void>((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
    },
  };
  const store = new SystemStore(repo, () => false, () => true);
  store.start();
  store.beginSimulation();
  try {
    const failed = store.reset();
    await store.reset();
    assert.equal(writes, 1);
    assert.equal(store.getSnapshot().productionStatus, 'JAMMED');
    assert.equal(store.getSnapshot().productionReason, 'Parada anterior');
    rejectWrite(new Error('permission-denied'));
    await failed;
    assert.equal(store.getSnapshot().productionStatus, 'JAMMED');
    assert.match(store.getSnapshot().syncError, /permission-denied/);
    const success = store.reset();
    await new Promise(resolve => setImmediate(resolve));
    resolveWrite();
    await success;
    assert.equal(store.getSnapshot().productionStatus, 'OPERACIONAL');
    assert.equal(store.getSnapshot().productionReason, '');
    receive('BLOQUEADO', 'reset-1', 'BL_07 — Lado Direito');
    assert.equal(store.getSnapshot().productionStatus, 'BLOQUEADO');
    assert.equal(store.getSnapshot().productionReason, 'BL_07 — Lado Direito');
  } finally { store.stop(); }
});

test('a new server alarm received during reset is not overwritten by the reset acknowledgement', async () => {
  let receive: (status: string) => void = () => {};
  let resolveWrite: () => void = () => {};
  const fake = fakeRepository();
  fake.repo.watchProduction = next => { receive = next; next('JAMMED'); return () => {}; };
  fake.repo.persist = () => new Promise<void>(resolve => { resolveWrite = resolve; });
  const store = new SystemStore(fake.repo, () => false, () => true);
  store.start();
  store.beginSimulation();
  try {
    const pending = store.reset();
    await new Promise(resolve => setImmediate(resolve));
    receive('OPERACIONAL');
    receive('BLOQUEADO');
    resolveWrite();
    await pending;
    assert.equal(store.getSnapshot().productionStatus, 'BLOQUEADO');
  } finally { store.stop(); }
});

test('remote operator reset resumes the active simulator and clears its weight-error window', () => {
  let receive: (status: string, token?: string) => void = () => {};
  const fake = fakeRepository();
  fake.repo.watchProduction = next => { receive = next; next('OPERACIONAL', 'old-reset'); return () => {}; };
  const store = new SystemStore(fake.repo);
  store.start();
  store.beginSimulation();
  try {
    store.tick(piece);
    for (let i = 0; i < 5; i++) store.tick({ ...piece, weight: 190, binId: 'BL_06_L' });
    assert.equal(store.getSnapshot().system.phase, 'interlocked');
    receive('OPERACIONAL', 'new-reset');
    assert.equal(store.getSnapshot().system.phase, 'running');
    assert.equal(store.getSnapshot().system.bins.BL_06_L.errors, 0);
    assert.equal(store.getSnapshot().system.bins.BL_06_L.totalProcessed, 1);
  } finally { store.stop(); }
});
