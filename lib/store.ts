import { type BinConfig, type BinId, type Configs } from './bins.ts';
import { initialSystem, resetSystem, simulate, updateDowntime, type Sample } from './system.ts';
import type { ProductionConfirmation, Repository } from './repository.ts';
import { LEASE_MS, RENEW_MS } from './lease.ts';
import { ProductionScheduler, SCHEDULER_INTERVAL_MS } from './production.ts';

type Lease = { id: string; since: number; wallTime: number; renewing: boolean };

export type Snapshot = {
  system: ReturnType<typeof initialSystem>; configs: Configs; configReady: boolean; configLoaded: boolean;
  configError: string; configWarning: string; syncError: string; resetting: boolean;
  productionStatus: string | null;
  productionReason: string;
  simulationStarted: boolean;
  simulationPaused: boolean;
  acquiring: boolean;
  productionReady: boolean;
  connectionError: string;
};

export class SystemStore {
  private state: Snapshot = {
    system: initialSystem(), configs: {}, configReady: false, configLoaded: false,
    configError: '', configWarning: '', syncError: '', resetting: false,
    productionStatus: null, productionReason: '',
    simulationStarted: false,
    simulationPaused: false,
    acquiring: false, productionReady: false,
    connectionError: '',
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
  private confirmation?: ProductionConfirmation;
  private lease?: Lease;
  private generation = 0;
  private acquisition = 0;
  private hasProductionSnapshot = false;
  private resetToken: string | undefined;
  private scheduler: ProductionScheduler;

  constructor(repo: Repository, canOperate: () => boolean = () => true, canReset: () => boolean = canOperate, deviationChance = 0) {
    this.repo = repo; this.canOperate = canOperate; this.canReset = canReset;
    this.scheduler = new ProductionScheduler(deviationChance);
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
    const generation = this.generation;
    this.update({ productionReady: !this.repo.watchProduction, productionStatus: null, productionReason: '', syncError: '', connectionError: '' });
    this.unsubscribe = this.repo.watchConfigs(result => {
      if (generation !== this.generation) return;
      if (result.invalidIds.length) this.scheduler.reset();
      this.update({
        configs: result.configs, configReady: result.invalidIds.length === 0, configLoaded: true,
        configError: result.invalidIds.length ? `Regulagem inválida: ${result.invalidIds.join(', ')}. Corrija para retomar a simulação.` : '',
        configWarning: result.unknownIds.length ? `Configurações com IDs não reconhecidos não foram aplicadas: ${result.unknownIds.join(', ')}.` : '',
      });
    }, error => {
      if (generation !== this.generation) return;
      this.scheduler.reset();
      this.update({ configReady: false, configLoaded: false, configError: `Falha ao carregar regulagens: ${error.message}` });
    });
    this.unsubscribeProduction = this.repo.watchProduction?.((productionStatus, resetToken, reason, confirmation) => {
      if (generation !== this.generation) return;
      const remoteReset = this.hasProductionSnapshot && resetToken !== undefined && resetToken !== this.resetToken;
      this.productionRevision++;
      this.hasProductionSnapshot = true;
      this.resetToken = resetToken;
      this.confirmation = confirmation;
      if (remoteReset || productionStatus !== 'OPERACIONAL'
        || (this.lease && confirmation?.leaseId !== this.lease.id)) this.suspendSimulation();
      this.update({ productionStatus, productionReason: productionStatus === 'OPERACIONAL' ? '' : reason ?? '',
        productionReady: true, connectionError: '',
        ...(remoteReset && productionStatus === 'OPERACIONAL' && this.canOperate() ? { system: resetSystem(this.state.system) } : {}),
      });
    }, error => {
      if (generation !== this.generation) return;
      this.suspendSimulation();
      this.update({ productionReady: false, connectionError: error.message });
    });
    if (!this.canOperate()) return this.stop;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.processSamples(now, () => this.scheduler.takeDue(now, this.state.configs));
    }, SCHEDULER_INTERVAL_MS);
    return this.stop;
  };
  stop = () => {
    this.generation++;
    this.suspendSimulation();
    this.confirmation = undefined;
    this.update({ simulationPaused: false, resetting: false, productionReady: false, configReady: false });
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeProduction?.();
    this.unsubscribeProduction = undefined;
  };
  private suspendSimulation(release = true) {
    this.acquisition++;
    this.scheduler.reset();
    const lease = this.lease;
    this.lease = undefined;
    this.update({ simulationStarted: false, acquiring: false });
    if (lease && release) this.release(lease.id);
  }
  private release(id: string) {
    if (this.repo.changeLease) {
      void this.enqueue(() => this.repo.changeLease!('release', id, '')).catch(() => {
        // A sessão pode ter terminado ou estar offline. A autorização expira no servidor.
      });
    }
  }
  tick(sample: Sample) {
    this.processSamples(sample.now, () => [sample]);
  }
  private processSamples(now: number, getSamples: () => Sample[]) {
    if (this.state.resetting || !this.canOperate()) {
      this.scheduler.reset();
      return;
    }
    const previous = this.state.system;
    if (previous.stop) {
      const system = updateDowntime(previous, now);
      if (system !== previous) this.update({ system });
      return;
    }
    if (!this.state.simulationStarted || !this.state.productionReady
      || (this.repo.watchProduction && this.state.productionStatus !== 'OPERACIONAL')) return;
    const lease = this.lease;
    const confirmation = this.confirmation;
    if (this.repo.changeLease) {
      if (!lease || !confirmation || this.leaseElapsed(lease) >= LEASE_MS) {
        this.suspendSimulation();
        this.update({ syncError: 'Autorização expirada. Inicie novamente.' });
        return;
      }
      if (!lease.renewing && this.leaseElapsed(lease) >= RENEW_MS) void this.renew(lease, confirmation.revision);
    }
    if (!this.state.configReady) return;
    let next = previous;
    for (const sample of getSamples()) {
      next = simulate(next, this.state.configs, sample);
      if (next.phase !== 'running') {
        this.scheduler.reset();
        break;
      }
    }
    if (previous === next) return;
    this.update({ system: next });
    if (previous.phase !== next.phase) {
      const resetToken = this.resetToken;
      const generation = this.generation;
      void this.enqueue(() => generation === this.generation && resetToken === this.resetToken
        ? this.repo.persist(next, false, resetToken ?? null, confirmation && { revision: confirmation.revision, leaseId: lease?.id ?? null }) : Promise.resolve()).catch(error => {
        if (generation === this.generation && resetToken === this.resetToken) {
          this.suspendSimulation();
          this.update({ syncError: `Falha ao salvar parada: ${String(error)}` });
        }
      });
    }
  }
  private leaseElapsed(lease: Lease) {
    return Math.max(performance.now() - lease.since, Date.now() - lease.wallTime);
  }
  private async renew(lease: Lease, revision: string) {
    lease.renewing = true;
    const since = performance.now();
    const wallTime = Date.now();
    try {
      await this.repo.changeLease!('renew', lease.id, revision);
      if (this.lease !== lease) return;
      if (this.leaseElapsed(lease) >= LEASE_MS) throw new Error('A confirmação chegou após a expiração local.');
      Object.assign(lease, { since, wallTime, renewing: false });
    } catch (error) {
      if (this.lease !== lease) return;
      this.suspendSimulation();
      this.update({ syncError: `Simulação suspensa: ${String(error)}` });
    }
  }
  beginSimulation = () => {
    if (!this.canOperate() || this.state.simulationStarted || this.state.resetting
      || this.state.acquiring || !this.state.configReady || !this.state.productionReady || this.state.system.phase !== 'running'
      || (this.repo.watchProduction && this.state.productionStatus !== 'OPERACIONAL')) return;
    if (this.repo.changeLease) return this.acquire();
    this.update({ simulationStarted: true, simulationPaused: false, syncError: '' });
  };
  private async acquire() {
    const confirmation = this.confirmation;
    if (!confirmation) return;
    const attempt = ++this.acquisition;
    const lease = { id: crypto.randomUUID(), since: performance.now(), wallTime: Date.now(), renewing: false };
    this.update({ acquiring: true, syncError: '' });
    try {
      await this.enqueue(() => {
        if (attempt !== this.acquisition) throw new Error('Início cancelado.');
        lease.since = performance.now();
        lease.wallTime = Date.now();
        return this.repo.changeLease!('acquire', lease.id, confirmation.revision);
      });
      if (attempt !== this.acquisition || !this.canOperate() || !this.state.configReady
        || this.confirmation?.revision !== confirmation.revision || this.leaseElapsed(lease) >= LEASE_MS) {
        this.release(lease.id);
        return;
      }
      this.lease = lease;
      this.update({ simulationStarted: true, simulationPaused: false });
    } catch (error) {
      if (attempt === this.acquisition) this.update({ syncError: `Não foi possível iniciar. Outra sessão pode estar executando a linha. ${String(error)}` });
    } finally {
      if (attempt === this.acquisition) this.update({ acquiring: false });
    }
  }
  pauseSimulation = () => {
    if (!this.canOperate() || !this.state.simulationStarted || this.state.resetting
      || this.state.system.phase !== 'running') return;
    this.suspendSimulation();
    this.update({ simulationPaused: true });
  };
  private enqueue(write: () => Promise<void>) {
    const result = this.writes.then(write);
    this.writes = result.catch(() => {});
    return result;
  }
  reset = async () => {
    if (!this.canReset()) { this.update({ syncError: 'Sua sessão não possui permissão para executar o reset.' }); return; }
    if (this.state.resetting || (this.repo.changeLease && !this.state.productionReady)) return;
    const generation = this.generation;
    const confirmation = this.confirmation;
    const leaseId = this.lease?.id;
    this.scheduler.reset();
    if (this.repo.changeLease) this.suspendSimulation(false);
    this.update({ resetting: true, syncError: '' });
    const productionRevision = this.productionRevision;
    try {
      await this.enqueue(() => {
        if (generation !== this.generation) throw new Error('A sessão mudou.');
        return this.repo.persist(updateDowntime(this.state.system, Date.now()), true, undefined,
          confirmation && { revision: confirmation.revision, leaseId: leaseId ?? confirmation.leaseId });
      });
      if (generation !== this.generation) return;
      this.update({ system: resetSystem(this.state.system), resetting: false, syncError: '',
        ...(!this.repo.changeLease && productionRevision === this.productionRevision ? { productionStatus: 'OPERACIONAL', productionReason: '' } : {}),
      });
    } catch (error) {
      if (leaseId) this.release(leaseId);
      if (generation === this.generation) this.update({ resetting: false, syncError: `Reset não confirmado na nuvem; estado preservado. ${String(error)}` });
    }
  };
  saveConfig = async (id: BinId, config: BinConfig) => {
    if (!this.canOperate()) throw new Error('Regulagem permitida apenas para OPERADOR.');
    await this.repo.saveConfig(id, config);
    this.update({ configs: { ...this.state.configs, [id]: config } });
  };
}
