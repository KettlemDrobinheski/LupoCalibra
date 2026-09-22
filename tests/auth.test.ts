import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticationMessage, canOperate, canRead, readRole, type Session, type SessionUser } from '../lib/access.ts';
import { SessionController, type SessionGateway } from '../lib/session.ts';
import { authorizedRepository } from '../lib/authorized-repository.ts';
import type { Repository } from '../lib/repository.ts';
import { initialSystem } from '../lib/system.ts';
import { SystemStore } from '../lib/store.ts';
import { validateFirebaseConfig } from '../lib/firebase-config.ts';
import { normalizeRegistration, registrationEmail, registrationFromEmail } from '../lib/registration.ts';

const admin: Session = { status: 'authorized', user: { uid: 'admin', email: null }, role: 'ADMIN', message: '' };
const operator: Session = { ...admin, role: 'OPERADOR' };

function sessionHarness() {
  let auth: (user: SessionUser | null) => void = () => {};
  const profiles: { uid: string; next: (data: unknown) => void; fail: (error: Error) => void }[] = [];
  let cleaned = 0;
  const gateway: SessionGateway = {
    watchAuth(next) { auth = next; return () => {}; },
    watchProfile(uid, next, fail) { profiles.push({ uid, next, fail }); return () => { cleaned++; }; },
  };
  const controller = new SessionController(gateway);
  return { controller, auth: (user: SessionUser | null) => auth(user), profiles, cleaned: () => cleaned };
}

test('authentication is known before profile reads; profile is confirmed before operational reads', () => {
  const harness = sessionHarness();
  const { controller } = harness;
  controller.start();
  assert.equal(controller.getSnapshot().status, 'loading');
  assert.equal(harness.profiles.length, 0);
  assert.equal(canRead(controller.getSnapshot()), false);
  harness.auth(null);
  assert.equal(harness.profiles.length, 0);
  assert.equal(controller.getSnapshot().status, 'signed-out');
  harness.auth({ uid: 'alice', email: null });
  assert.equal(harness.profiles.length, 1);
  assert.equal(controller.getSnapshot().status, 'authorizing');
  assert.equal(canRead(controller.getSnapshot()), false);
  harness.profiles[0].next({ role: 'OPERADOR', active: true });
  assert.equal(canOperate(controller.getSnapshot()), true);
  controller.stop();
});

test('account alone, missing profile, malformed role and inactive profile do not authorize', () => {
  for (const value of [undefined, {}, { role: 'ADMIN' }, { role: 'ADMIN', active: false }, { role: 'admin', active: true }, { role: 'ADMIN', active: 'true' }, { role: 'UNKNOWN', active: true }]) assert.equal(readRole(value), null);
  const harness = sessionHarness();
  harness.controller.start();
  harness.auth({ uid: 'unlisted', email: null });
  harness.profiles[0].next(null);
  assert.equal(harness.controller.getSnapshot().status, 'denied');
  assert.equal(canRead(harness.controller.getSnapshot()), false);
  harness.controller.stop();
});

test('profile changes revoke privileges; callbacks from previous users cannot grant access', () => {
  const harness = sessionHarness();
  harness.controller.start();
  harness.auth({ uid: 'alice', email: null });
  harness.profiles[0].next({ role: 'OPERADOR', active: true });
  harness.profiles[0].next({ role: 'ADMIN', active: true });
  assert.equal(canOperate(harness.controller.getSnapshot()), false);
  assert.equal(canRead(harness.controller.getSnapshot()), true);
  harness.auth({ uid: 'bob', email: null });
  harness.profiles[0].next({ role: 'ADMIN', active: true });
  assert.equal(harness.controller.getSnapshot().status, 'authorizing');
  harness.profiles[1].next({ role: 'ADMIN', active: false });
  assert.equal(canRead(harness.controller.getSnapshot()), false);
  harness.auth(null);
  harness.profiles[1].next({ role: 'ADMIN', active: true });
  assert.equal(harness.controller.getSnapshot().status, 'signed-out');
  assert.equal(harness.cleaned(), 2);
  harness.controller.stop();
});

test('profile failure denies access and logout suspends capabilities immediately', () => {
  const harness = sessionHarness();
  harness.controller.start();
  harness.auth({ uid: 'alice', email: null });
  harness.profiles[0].fail(new Error('permission-denied'));
  assert.equal(canRead(harness.controller.getSnapshot()), false);
  harness.profiles[0].next({ role: 'ADMIN', active: true });
  harness.controller.suspend();
  assert.equal(canRead(harness.controller.getSnapshot()), false);
  harness.profiles[0].next({ role: 'ADMIN', active: true });
  assert.equal(canRead(harness.controller.getSnapshot()), false);
  harness.controller.stop();
});

test('repository checks deny operational reads before authorization and writes by administrators', async () => {
  let reads = 0;
  let writes = 0;
  const repo: Repository = {
    watchConfigs() { reads++; return () => {}; },
    async saveConfig() { writes++; },
    async persist() { writes++; },
  };
  let session: Session = { ...admin, status: 'loading' };
  const protectedRepo = authorizedRepository(repo, () => session);
  assert.throws(() => protectedRepo.watchConfigs(() => {}, () => {}), /não autorizada/);
  assert.equal(reads, 0);
  session = admin;
  protectedRepo.watchConfigs(() => {}, () => {});
  assert.equal(reads, 1);
  await assert.rejects(protectedRepo.persist(initialSystem(), false), /não autorizada/);
  await assert.rejects(protectedRepo.saveConfig('BL_06_L', { pesoAlvo: 170, toleranciaPorcentagem: 0 }), /não autorizada/);
  assert.equal(writes, 0);
  session = operator;
  await protectedRepo.persist(initialSystem(), true);
  await protectedRepo.saveConfig('BL_06_L', { pesoAlvo: 170, toleranciaPorcentagem: 0 });
  assert.equal(writes, 2);
  session = { ...admin, status: 'signed-out', user: null };
  await assert.rejects(protectedRepo.persist(initialSystem(), true));
  assert.equal(writes, 2);
  session = { ...operator, user: { uid: 'another-operator', email: null } };
  await assert.rejects(protectedRepo.persist(initialSystem(), true), /sessão original/);
  assert.equal(writes, 2);
});

test('administrator cannot reset, simulate or change settings', async () => {
  let writes = 0;
  const repo: Repository = {
    watchConfigs(next) { next({ configs: {}, unknownIds: [], invalidIds: [] }); return () => {}; },
    watchProduction(next) { next('OPERACIONAL'); return () => {}; },
    async saveConfig() { writes++; }, async persist() { writes++; },
  };
  const store = new SystemStore(repo, () => canOperate(admin), () => canOperate(admin));
  store.start();
  store.tick({ weight: 170, side: 'L', jam: true, failure: false, eventId: 'no-write', now: 1000 });
  await store.reset();
  await assert.rejects(store.saveConfig('BL_06_L', { pesoAlvo: 170, toleranciaPorcentagem: 0 }));
  assert.equal(writes, 0);
  assert.equal(store.getSnapshot().system.phase, 'running');
  assert.equal(store.getSnapshot().productionStatus, 'OPERACIONAL');
  store.stop();
});

test('operational writes require the original active operator session', async () => {
  let writes = 0;
  const repo: Repository = { watchConfigs() { return () => {}; }, async saveConfig() {}, async persist() { writes++; } };
  let session: Session = operator;
  const secured = authorizedRepository(repo, () => session);
  await secured.persist(initialSystem(), true);
  assert.equal(writes, 1);
  await secured.persist(initialSystem(), false);
  session = { ...operator, status: 'denied' };
  await assert.rejects(secured.persist(initialSystem(), true));
  session = { ...operator, user: { uid: 'replacement', email: null } };
  await assert.rejects(secured.persist(initialSystem(), true));
  assert.equal(writes, 2);
});

test('environment validation reveals missing variable names only; storage is optional', () => {
  assert.throws(() => validateFirebaseConfig({}), /NEXT_PUBLIC_FIREBASE_API_KEY/);
  assert.doesNotThrow(() => validateFirebaseConfig({ apiKey: 'public-test', projectId: 'demo-test', authDomain: 'test.invalid', appId: 'test-app' }));
  assert.throws(() => validateFirebaseConfig({ apiKey: ' ' }), /NEXT_PUBLIC_FIREBASE_API_KEY/);
});

test('invalid credentials do not disclose whether an account exists or raw server errors', () => {
  assert.equal(authenticationMessage({ code: 'auth/user-not-found' }), authenticationMessage({ code: 'auth/wrong-password' }));
  assert.equal(authenticationMessage({ code: 'auth/invalid-credential' }), 'Matrícula ou senha inválidos.');
  assert.ok(!authenticationMessage(new Error('sensitive-detail')).includes('sensitive-detail'));
});

test('numeric registrations preserve leading zeros and map to distinct accounts', () => {
  assert.equal(normalizeRegistration(' 001234 '), '001234');
  assert.equal(registrationEmail(' 001234 '), '001234@lupocalibra.invalid');
  assert.notEqual(registrationEmail('001234'), registrationEmail('1234'));
  assert.equal(registrationFromEmail(registrationEmail('001234')), '001234');
  assert.equal(registrationFromEmail(null), null);
  assert.equal(registrationFromEmail('001234@other.invalid'), null);
  assert.equal(registrationFromEmail('001234@lupocalibra.invalid.other'), null);
});

test('invalid registrations cannot become login identifiers and do not reveal account existence', () => {
  for (const input of ['', ' ', '12 34', 'AB123', '12-34', '1e3', '-123', '12.3', '１２３', '123@example.com', '1'.repeat(33)]) {
    assert.throws(() => registrationEmail(input), error => {
      assert.equal(authenticationMessage(error), 'Matrícula ou senha inválidos.');
      return true;
    });
  }
  assert.equal(normalizeRegistration('0'), '0');
  assert.equal(normalizeRegistration('1'.repeat(32)).length, 32);
});
