import { collection, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { getAuthentication, getDatabase } from './firebase.ts';
import { isBinId, isValidConfig, readConfigs, type BinConfig, type BinId } from './bins.ts';
import type { SystemState } from './system.ts';

export type ConfigurationResult = ReturnType<typeof readConfigs>;
export interface Repository {
  watchProduction?: (receive: (status: string, resetToken?: string, reason?: string) => void, fail: (error: Error) => void) => () => void;
  watchConfigs: (receive: (result: ConfigurationResult) => void, fail: (error: Error) => void) => () => void;
  saveConfig: (id: BinId, config: BinConfig) => Promise<void>;
  persist: (state: SystemState, reset: boolean, expectedResetToken?: string | null) => Promise<void>;
}

export const repository: Repository = {
  watchProduction(receive, fail) {
    return onSnapshot(doc(getDatabase(), 'producao_diaria', 'linha_export'), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      const status = data?.statusGeral;
      receive(['OPERACIONAL', 'JAMMED', 'BLOQUEADO'].includes(status) ? status : 'SEM REGISTRO VÁLIDO',
        typeof data?.resetToken === 'string' ? data.resetToken : undefined,
        typeof data?.motivoParada === 'string' ? data.motivoParada : undefined);
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
  async persist(state, reset, expectedResetToken) {
    const db = getDatabase();
    const resetToken = reset ? crypto.randomUUID() : undefined;
    const uid = getAuthentication().currentUser?.uid;
    if (reset && !uid) throw new Error('Sessão encerrada. Entre novamente para executar o reset.');
    await runTransaction(db, async batch => {
      const production = await batch.get(doc(db, 'producao_diaria', 'linha_export'));
      if (!reset && expectedResetToken !== undefined && (production.data()?.resetToken ?? null) !== expectedResetToken) return;
      batch.set(doc(db, 'producao_diaria', 'linha_export'), {
        ultimo_registro: serverTimestamp(),
        systemInterlockActive: !reset && state.phase === 'interlocked',
        machineJamActive: !reset && state.phase === 'jammed',
        statusGeral: reset || state.phase === 'running' ? 'OPERACIONAL' : state.phase === 'jammed' ? 'JAMMED' : 'BLOQUEADO',
        motivoParada: reset ? '' : state.stop?.reason ?? '',
        ...(reset ? { resetToken } : {}),
      }, { merge: true });
      if (state.stop) {
        batch.set(doc(db, 'historico_paradas', state.stop.id), {
          horario: new Date(state.stop.startedAt), tipo: state.stop.type,
          motivo: state.stop.reason, duracao_segundos: state.downtimeSeconds,
        }, { merge: true });
      }
      if (reset) batch.set(doc(db, 'estado_sistema', 'geral'), {
        alertaAtivo: false, tempoEsteiraTravada: 0,
        ultimaLimpeza: new Date().toLocaleString('pt-BR'),
        resetToken, resetEm: serverTimestamp(), resetPor: uid,
      }, { merge: true });
    });
  },
};
