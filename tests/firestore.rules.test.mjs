import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const address = process.env.FIRESTORE_EMULATOR_HOST;
if (!address || !/^(127\.0\.0\.1|localhost):\d+$/.test(address)) {
  throw new Error('Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and start the local emulator for demo-lupocalibra-tests. No production fallback is allowed.');
}
const [host, port] = address.split(':');
let environment;
const config = { pesoAlvo: 170, toleranciaPorcentagem: 0, ultimaAtualizacao: 'teste' };
const production = () => ({ ultimo_registro: serverTimestamp(), systemInterlockActive: false, machineJamActive: false, statusGeral: 'OPERACIONAL', motivoParada: '' });
const reset = { alertaAtivo: false, tempoEsteiraTravada: 0, ultimaLimpeza: 'teste' };
const stop = () => ({ horario: new Date(1000), tipo: 'JAM', motivo: 'Teste local', duracao_segundos: 0 });
const database = uid => uid ? environment.authenticatedContext(uid).firestore() : environment.unauthenticatedContext().firestore();

before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-lupocalibra-tests', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, role, active] of [['admin', 'ADMIN', true], ['operator', 'OPERADOR', true], ['inactive', 'ADMIN', false], ['bad-role', 'admin', true]]) {
      await setDoc(doc(db, 'acessos', uid), { role, active });
    }
    await setDoc(doc(db, 'configuracoes_cubas', 'BL_06_L'), { ...config, campoLegado: 'preservar' });
    await setDoc(doc(db, 'configuracoes_cubas', '1_L'), config);
    await setDoc(doc(db, 'producao_diaria', 'linha_export'), production());
    await setDoc(doc(db, 'estado_sistema', 'geral'), reset);
    await setDoc(doc(db, 'historico_paradas', 'existing'), stop());
  });
});
after(async () => { await environment?.cleanup(); });

test('unauthenticated, unlisted, inactive and invalid-role users cannot read or write operational data', async () => {
  for (const uid of [null, 'unlisted', 'inactive', 'bad-role']) {
    const db = database(uid);
    for (const path of ['configuracoes_cubas/BL_06_L', 'producao_diaria/linha_export', 'estado_sistema/geral', 'historico_paradas/existing']) await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, 'configuracoes_cubas')));
    await assertFails(setDoc(doc(db, 'estado_sistema', 'geral'), reset));
  }
});

test('a user may read only their own access document and no client can grant roles', async () => {
  for (const uid of ['admin', 'operator', 'unlisted']) {
    const db = database(uid);
    await assertSucceeds(getDoc(doc(db, 'acessos', uid)));
    await assertFails(getDocs(collection(db, 'acessos')));
    await assertFails(getDoc(doc(db, 'acessos', uid === 'admin' ? 'operator' : 'admin')));
    await assertFails(setDoc(doc(db, 'acessos', uid), { role: 'ADMIN', active: true }));
    await assertFails(deleteDoc(doc(db, 'acessos', uid)));
  }
});

test('operators cannot regulate, write partial resets, simulate stops or alter history', async () => {
  const db = database('operator');
  await assertSucceeds(getDocs(collection(db, 'configuracoes_cubas')));
  await assertSucceeds(getDoc(doc(db, 'producao_diaria', 'linha_export')));
  await assertSucceeds(getDoc(doc(db, 'estado_sistema', 'geral')));
  await assertFails(setDoc(doc(db, 'configuracoes_cubas', 'BL_07_L'), config));
  await assertFails(setDoc(doc(db, 'estado_sistema', 'geral'), reset));
  await assertFails(setDoc(doc(db, 'producao_diaria', 'linha_export'), production()));
  await assertFails(setDoc(doc(db, 'historico_paradas', 'operator-stop'), stop()));
  await assertFails(getDocs(collection(db, 'historico_paradas')));
  const batch = writeBatch(db);
  batch.set(doc(db, 'producao_diaria', 'linha_export'), production(), { merge: true });
  batch.set(doc(db, 'estado_sistema', 'geral'), reset, { merge: true });
  await assertFails(batch.commit());
});

function operatorResetBatch(db, resetChanges = {}, productionChanges = {}) {
  const resetToken = randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, 'producao_diaria', 'linha_export'), { ...production(), resetToken, ...productionChanges }, { merge: true });
  batch.set(doc(db, 'estado_sistema', 'geral'), {
    ...reset, resetToken, resetEm: serverTimestamp(), resetPor: 'operator', ...resetChanges,
  }, { merge: true });
  return batch;
}

test('operator atomically resets JAMMED and BLOQUEADO without changing settings or deleting history', async () => {
  const db = database('operator');
  for (const statusGeral of ['JAMMED', 'BLOQUEADO']) {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'producao_diaria', 'linha_export'), {
        ...production(), statusGeral, machineJamActive: statusGeral === 'JAMMED',
        systemInterlockActive: statusGeral === 'BLOQUEADO', motivoParada: 'BL_06 — Lado Esquerdo', totalLegado: 42,
      }, { merge: true });
    });
    await assertSucceeds(operatorResetBatch(db).commit());
    const data = (await getDoc(doc(db, 'producao_diaria', 'linha_export'))).data();
    assert.equal(data.statusGeral, 'OPERACIONAL');
    assert.equal(data.machineJamActive, false);
    assert.equal(data.systemInterlockActive, false);
    assert.equal(data.motivoParada, '');
    assert.equal(data.totalLegado, 42);
    const resetData = (await getDoc(doc(db, 'estado_sistema', 'geral'))).data();
    assert.equal(resetData.resetPor, 'operator');
    assert.equal(resetData.resetToken, data.resetToken);
    await environment.withSecurityRulesDisabled(async context => {
      assert.equal((await getDoc(doc(context.firestore(), 'historico_paradas', 'existing'))).exists(), true);
    });
  }
});

test('operator reset rejects forged actors, stale markers, extra fields and invalid states', async () => {
  const db = database('operator');
  await assertFails(operatorResetBatch(db, { resetPor: 'admin' }).commit());
  await assertFails(operatorResetBatch(db, { resetEm: new Date(0) }).commit());
  await assertFails(operatorResetBatch(db, { alertaAtivo: true }).commit());
  await assertFails(operatorResetBatch(db, {}, { statusGeral: 'JAMMED', machineJamActive: true }).commit());
  await assertFails(operatorResetBatch(db, {}, { totalLegado: 0 }).commit());
  await assertFails(operatorResetBatch(db, {}, { motivoParada: 'Inventado' }).commit());
  const previous = (await getDoc(doc(db, 'producao_diaria', 'linha_export'))).data().resetToken;
  await assertFails(operatorResetBatch(db, { resetToken: previous }, { resetToken: previous }).commit());
  for (const uid of [null, 'unlisted', 'inactive', 'bad-role']) {
    await assertFails(operatorResetBatch(database(uid)).commit());
  }
});

test('admin can save all 16 canonical BLs, preserve legacy fields and perform the actual reset batch', async () => {
  const db = database('admin');
  for (const code of ['06', '07', '08', '09', '10', '11', '12', '200UP']) for (const side of ['L', 'R']) {
    await assertSucceeds(setDoc(doc(db, 'configuracoes_cubas', `BL_${code}_${side}`), config, { merge: true }));
  }
  assert.equal((await getDoc(doc(db, 'configuracoes_cubas', 'BL_06_L'))).data().campoLegado, 'preservar');
  await assertSucceeds(setDoc(doc(db, 'historico_paradas', 'reset-event'), stop()));
  const batch = writeBatch(db);
  batch.set(doc(db, 'producao_diaria', 'linha_export'), production(), { merge: true });
  batch.set(doc(db, 'estado_sistema', 'geral'), reset, { merge: true });
  batch.set(doc(db, 'historico_paradas', 'reset-event'), { ...stop(), duracao_segundos: 12 }, { merge: true });
  await assertSucceeds(batch.commit());
});

test('even admin cannot delete, alter unknown fields/IDs, corrupt values or rewrite historical events', async () => {
  const db = database('admin');
  for (const path of ['configuracoes_cubas/BL_06_L', 'producao_diaria/linha_export', 'estado_sistema/geral', 'historico_paradas/existing']) await assertFails(deleteDoc(doc(db, path)));
  await assertFails(setDoc(doc(db, 'configuracoes_cubas', '1_L'), config));
  await assertFails(setDoc(doc(db, 'configuracoes_cubas', 'BL_99_L'), config));
  await assertFails(updateDoc(doc(db, 'configuracoes_cubas', 'BL_06_L'), { campoLegado: 'alterado' }));
  for (const value of [{ pesoAlvo: 0 }, { toleranciaPorcentagem: -1 }, { toleranciaPorcentagem: 101 }, { pesoAlvo: '170' }]) await assertFails(setDoc(doc(db, 'configuracoes_cubas', 'BL_07_L'), { ...config, ...value }));
  await assertFails(setDoc(doc(db, 'producao_diaria', 'linha_export'), { ...production(), machineJamActive: true }));
  await assertFails(setDoc(doc(db, 'estado_sistema', 'geral'), { ...reset, alertaAtivo: true }));
  await assertFails(updateDoc(doc(db, 'historico_paradas', 'existing'), { motivo: 'reescrever' }));
  await assertFails(updateDoc(doc(db, 'historico_paradas', 'existing'), { duracao_segundos: -1 }));
  await assertFails(setDoc(doc(db, 'outra_colecao', 'documento'), { data: true }));
});

test('role deactivation revokes access without trusting a client role', async () => {
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'acessos', 'revoked'), { role: 'ADMIN', active: true }));
  const db = database('revoked');
  await assertSucceeds(getDoc(doc(db, 'estado_sistema', 'geral')));
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'acessos', 'revoked'), { active: false }));
  await assertFails(getDoc(doc(db, 'estado_sistema', 'geral')));
  await assertFails(setDoc(doc(db, 'estado_sistema', 'geral'), reset));
});
