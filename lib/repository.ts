import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, type DocumentData } from 'firebase/firestore';
import { getAuthentication, getDatabase } from './firebase.ts';
import { isBinId, isValidConfig, readConfigs, type BinConfig, type BinId } from './bins.ts';
import type { SystemState } from './system.ts';

export type ConfigurationResult = ReturnType<typeof readConfigs>;
export type ProductionConfirmation = { revision: string; leaseId: string | null };
type WriteCondition = { revision: string; leaseId: string | null };
type LeaseAction = 'acquire' | 'renew' | 'release';
export interface Repository {
  watchProduction?: (receive: (status: string, resetToken?: string, reason?: string, confirmation?: ProductionConfirmation) => void, fail: (error: Error) => void) => () => void;
  watchConfigs: (receive: (result: ConfigurationResult) => void, fail: (error: Error) => void) => () => void;
  saveConfig: (id: BinId, config: BinConfig) => Promise<void>;
  persist: (state: SystemState, reset: boolean, expectedResetToken?: string | null, condition?: WriteCondition) => Promise<void>;
  changeLease?: (action: LeaseAction, id: string, revision: string) => Promise<void>;
}

function revision(data: DocumentData | undefined) {
  const time = data?.ultimo_registro;
  return JSON.stringify([data?.statusGeral, data?.resetToken, data?.stopId,
    time instanceof Timestamp ? [time.seconds, time.nanoseconds] : null]);
}

export const repository: Repository = {
  watchProduction(receive, fail) {
    return onSnapshot(doc(getDatabase(), 'producao_diaria', 'linha_export'), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites) return;
      if (snapshot.metadata.fromCache) {
        fail(new Error('Aguardando confirmação do servidor.'));
        return;
      }
      const data = snapshot.data();
      const status = data?.statusGeral;
      receive(['OPERACIONAL', 'JAMMED', 'BLOQUEADO'].includes(status) ? status : 'SEM REGISTRO VÁLIDO',
        typeof data?.resetToken === 'string' ? data.resetToken : undefined,
        typeof data?.motivoParada === 'string' ? data.motivoParada : undefined,
        { revision: revision(data), leaseId: typeof data?.lease?.id === 'string' ? data.lease.id : null });
    }, fail);
  },
  watchConfigs(receive, fail) {
    return onSnapshot(collection(getDatabase(), 'configuracoes_cubas'), snapshot => {
      receive(readConfigs(snapshot.docs.map(document => ({ id: document.id, data: document.data() }))));
    }, fail);
  },
  async saveConfig(id, config) {
    if (!isBinId(id) || !isValidConfig(config)) throw new Error('Parâmetros de regulagem inválidos.');
    await setDoc(doc(getDatabase(), 'configuracoes_cubas', id), {
      ...config, ultimaAtualizacao: new Date().toLocaleString('pt-BR'),
    }, { merge: true });
  },
  async changeLease(action, id, expectedRevision) {
    const uid = getAuthentication().currentUser?.uid;
    if (!uid) throw new Error('Sessão encerrada.');
    const db = getDatabase();
    const line = doc(db, 'producao_diaria', 'linha_export');
    await runTransaction(db, async transaction => {
      const data = (await transaction.get(line)).data();
      const lease = data?.lease;
      if (action === 'release') {
        if (lease?.id === id && lease?.uid === uid) transaction.update(line, { lease: null });
        return;
      }
      if (revision(data) !== expectedRevision || data?.statusGeral !== 'OPERACIONAL') {
        throw new Error('O estado da linha mudou. Confira o painel e tente novamente.');
      }
      if (action === 'renew' && (lease?.id !== id || lease?.uid !== uid)) {
        throw new Error('Esta aba perdeu a autorização.');
      }
      transaction.update(line, { lease: { id, uid, renewedAt: serverTimestamp() } });
    });
  },
  async persist(state, reset, expectedResetToken, condition) {
    const db = getDatabase();
    const resetToken = reset ? crypto.randomUUID() : undefined;
    const uid = getAuthentication().currentUser?.uid;
    if (reset && !uid) throw new Error('Sessão encerrada. Entre novamente para executar o reset.');
    await runTransaction(db, async batch => {
      const production = await batch.get(doc(db, 'producao_diaria', 'linha_export'));
      const data = production.data();
      if (!condition || revision(data) !== condition.revision
        || (data?.lease?.id ?? null) !== condition.leaseId
        || (!reset && ((data?.resetToken ?? null) !== expectedResetToken || data?.lease?.id !== condition.leaseId || data?.lease?.uid !== uid))) {
        throw new Error('A linha mudou. Aguarde a sincronização antes de tentar novamente.');
      }
      batch.set(production.ref, {
        ultimo_registro: serverTimestamp(),
        systemInterlockActive: !reset && state.phase === 'interlocked',
        machineJamActive: !reset && state.phase === 'jammed',
        statusGeral: reset || state.phase === 'running' ? 'OPERACIONAL' : state.phase === 'jammed' ? 'JAMMED' : 'BLOQUEADO',
        motivoParada: reset ? '' : state.stop?.reason ?? '',
        lease: null,
        stopId: reset ? null : state.stop?.id ?? null,
        ...(reset ? { resetToken } : {}),
      }, { merge: true });
      if (state.stop && !reset) {
        batch.set(doc(db, 'historico_paradas', state.stop.id), {
          horario: new Date(state.stop.startedAt), tipo: state.stop.type,
          motivo: state.stop.reason, duracao_segundos: state.downtimeSeconds,
          leaseId: condition.leaseId,
        }, { merge: true });
      }
      if (reset && state.stop && data?.stopId === state.stop.id) {
        batch.update(doc(db, 'historico_paradas', state.stop.id), { duracao_segundos: state.downtimeSeconds });
      }
      if (reset) batch.set(doc(db, 'estado_sistema', 'geral'), {
        alertaAtivo: false, tempoEsteiraTravada: 0,
        ultimaLimpeza: new Date().toLocaleString('pt-BR'),
        resetToken, resetEm: serverTimestamp(), resetPor: uid,
      }, { merge: true });
    });
  },
};
