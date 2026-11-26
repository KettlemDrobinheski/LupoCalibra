import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINS } from '../lib/bins.ts';
import { createDemo } from '../lib/demo.ts';
import { MAX_ALLOWED_ERRORS } from '../lib/system.ts';

const sample = { weight: 170, side: 'L', binId: 'BL_06_L', jam: false, failure: false, now: 1000, eventId: 'demo-piece' } as const;

test('demo instances have 16 bins and keep processing and settings independent', async () => {
  const first = createDemo();
  const second = createDemo();
  first.store.start();
  second.store.start();
  try {
    assert.equal(Object.keys(first.store.getSnapshot().system.bins).length, 16);
    assert.equal(BINS.length, 16);
    await first.store.saveConfig(sample.binId, { pesoAlvo: 170, toleranciaPorcentagem: 0 });
    first.store.beginSimulation();
    first.store.tick(sample);
    second.store.tick(sample);
    assert.equal(first.store.getSnapshot().system.bins[sample.binId].totalProcessed, 1);
    assert.equal(second.store.getSnapshot().system.bins[sample.binId].totalProcessed, 0);
    assert.equal(second.store.getSnapshot().configs[sample.binId], undefined);
  } finally {
    first.store.stop();
    second.store.stop();
  }
});

test('demo pauses, resumes, trips the real weight interlock and resets locally', async () => {
  const demo = createDemo();
  demo.store.start();
  try {
    demo.block();
    assert.equal(demo.store.getSnapshot().system.phase, 'running');
    await demo.store.saveConfig(sample.binId, { pesoAlvo: 170, toleranciaPorcentagem: 0 });
    demo.store.beginSimulation();
    demo.store.tick(sample);
    demo.store.pauseSimulation();
    demo.store.tick(sample);
    demo.block();
    assert.equal(demo.store.getSnapshot().system.bins[sample.binId].totalProcessed, 1);
    assert.equal(demo.store.getSnapshot().system.phase, 'running');
    demo.store.beginSimulation();
    demo.store.tick(sample);
    demo.block();
    const blocked = demo.store.getSnapshot().system;
    assert.equal(blocked.phase, 'interlocked');
    assert.equal(blocked.bins[sample.binId].errors, MAX_ALLOWED_ERRORS);
    assert.match(blocked.stop?.reason ?? '', /BL_06.*5 peças fora do peso/);
    demo.store.tick(sample);
    assert.equal(demo.store.getSnapshot().system.bins[sample.binId].totalProcessed, 2);

    await demo.reset();
    const reset = demo.store.getSnapshot();
    assert.equal(reset.system.phase, 'running');
    assert.equal(reset.system.stop, null);
    assert.equal(reset.system.bins[sample.binId].errors, 0);
    assert.equal(reset.system.bins[sample.binId].totalProcessed, 2);
    assert.equal(reset.simulationStarted, false);
    assert.equal(reset.configs[sample.binId]?.pesoAlvo, 170);
  } finally { demo.store.stop(); }
});
