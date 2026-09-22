import { type BinConfig, type BinId, type Configs } from './bins.ts';
import { initialSystem, resetSystem, simulate, updateDowntime, SIMULATION_INTERVAL_MS, type Sample } from './system.ts';
import type { Repository } from './repository.ts';

export type Snapshot = {
  system: ReturnType<typeof initialSystem>; configs: Configs; configReady: boolean; configLoaded: boolean;
  configError: string; configWarning: string; syncError: string; resetting: boolean;
  productionStatus: string | null;
  productionReason: string;
  simulationStarted: boolean;
};

export class SystemStore {
  private state: Snapshot = {
    system: initialSystem(), configs: {}, configReady: false, configLoaded: false,
    configError: '', configWarning: '', syncError: '', resetting: false,
    productionStatus: null, productionReason: '',
    simulationStarted: false,
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeProduction: (() => void) | undefined;
  private writes: Promise<void> = Promise.resolve();
  private repo: Repository;
  private canOperate: () => boolean;
  private canReset: () => boolean;
  private productionRevision = 0;
  private productionReady = false;
  private hasProductionSnapshot = false;
  private resetToken: string | undefined;

  constructor(repo: Repository, canOperate: () => boolean = () => true, canReset: () => boolean = canOperate) {
    this.repo = repo; this.canOperate = canOperate; this.canReset = canReset;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(change: Partial<Snapshot>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach(listener => listener());
  }
  start = () => {
    this.stop();
    this.productionReady = !this.repo.watchProduction;
    this.unsubscribe = this.repo.watchConfigs(result => {
      this.update({
        configs: result.configs, configReady: result.invalidIds.length === 0, configLoaded: true,
        configError: result.invalidIds.length ? `Regulagem inválida: ${result.invalidIds.join(', ')}. Corrija para retomar a simulação.` : '',
        configWarning: result.unknownIds.length ? `Configurações com IDs não reconhecidos não foram aplicadas: ${result.unknownIds.join(', ')}.` : '',
      });
    }, error => this.update({ configReady: false, configLoaded: false, configError: `Falha ao carregar regulagens: ${error.message}` }));
    this.unsubscribeProduction = this.repo.watchProduction?.((productionStatus, resetToken, reason) => {
      const remoteReset = this.hasProductionSnapshot && resetToken !== undefined && resetToken !== this.resetToken;
      this.productionRevision++;
      this.productionReady = true;
      this.hasProductionSnapshot = true;
      this.resetToken = resetToken;
      this.update({ productionStatus, productionReason: productionStatus === 'OPERACIONAL' ? '' : reason ?? '',
        ...(remoteReset && productionStatus === 'OPERACIONAL' && this.canOperate() && !this.state.resetting ? { system: resetSystem(this.state.system) } : {}),
      });
    }, () => {
      this.productionReady = false;
      this.update({ productionStatus: null, syncError: 'Não foi possível consultar o status salvo da produção.' });
    });
    if (!this.canOperate()) return this.stop;
    this.timer = setInterval(() => this.tick({
      weight: Math.floor(Math.random() * 251) + 150, side: Math.random() < 0.5 ? 'L' : 'R',
      jam: false, failure: Math.random() < 0.02,
      now: Date.now(), eventId: crypto.randomUUID(),
    }), SIMULATION_INTERVAL_MS);
    return this.stop;
  };
  stop = () => {
    this.update({ simulationStarted: false });
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeProduction?.();
    this.unsubscribeProduction = undefined;
  };
  tick(sample: Sample) {
    if (!this.state.simulationStarted || this.state.resetting || !this.canOperate() || !this.productionReady) return;
    const previous = this.state.system;
    const next = this.state.configReady ? simulate(previous, this.state.configs, sample) : updateDowntime(previous, sample.now);
    if (previous === next) return;
    this.update({ system: next });
    if (previous.phase !== next.phase) {
      const resetToken = this.resetToken;
      void this.enqueue(() => resetToken === this.resetToken
        ? this.repo.persist(next, false, resetToken ?? null) : Promise.resolve()).catch(error => {
        this.update({ syncError: `Falha ao salvar parada: ${String(error)}` });
      });
    }
  }
  beginSimulation = () => {
    if (!this.canOperate() || this.state.simulationStarted || this.state.resetting
      || !this.state.configReady || !this.productionReady || this.state.system.phase !== 'running'
      || (this.repo.watchProduction && this.state.productionStatus !== 'OPERACIONAL')) return;
    this.update({ simulationStarted: true });
  };
  private enqueue(write: () => Promise<void>) {
    const result = this.writes.then(write);
    this.writes = result.catch(() => {});
    return result;
  }
  reset = async () => {
    if (!this.canReset()) { this.update({ syncError: 'Sua sessão não possui permissão para executar o reset.' }); return; }
    if (this.state.resetting) return;
    this.update({ resetting: true, syncError: '' });
    const productionRevision = this.productionRevision;
    try {
      await this.enqueue(() => this.repo.persist(updateDowntime(this.state.system, Date.now()), true));
      this.update({ system: resetSystem(this.state.system), resetting: false, syncError: '',
        ...(productionRevision === this.productionRevision ? { productionStatus: 'OPERACIONAL', productionReason: '' } : {}),
      });
    } catch (error) {
      this.update({ resetting: false, syncError: `Reset não confirmado na nuvem; estado preservado. ${String(error)}` });
    }
  };
  saveConfig = async (id: BinId, config: BinConfig) => {
    if (!this.canOperate()) throw new Error('Regulagem permitida apenas para OPERADOR.');
    await this.repo.saveConfig(id, config);
    this.update({ configs: { ...this.state.configs, [id]: config } });
  };
}
