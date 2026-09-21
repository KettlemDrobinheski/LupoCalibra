import { readRole, type Session, type SessionUser } from './access.ts';

export interface SessionGateway {
  watchAuth: (receive: (user: SessionUser | null) => void, fail: (error: Error) => void) => () => void;
  watchProfile: (uid: string, receive: (profile: unknown) => void, fail: (error: Error) => void) => () => void;
}

export class SessionController {
  private state: Session = { status: 'loading', user: null, role: null, message: '' };
  private listeners = new Set<() => void>();
  private gateway: SessionGateway;
  private unsubscribeAuth?: () => void;
  private unsubscribeProfile?: () => void;
  private generation = 0;
  private run = 0;
  constructor(gateway: SessionGateway) { this.gateway = gateway; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: Session) { this.state = state; this.listeners.forEach(listener => listener()); }
  suspend = () => {
    this.generation++;
    this.unsubscribeProfile?.();
    this.unsubscribeProfile = undefined;
    this.update({ status: 'loading', user: null, role: null, message: '' });
  };
  start = () => {
    this.stop();
    this.suspend();
    const run = this.run;
    try {
      this.unsubscribeAuth = this.gateway.watchAuth(user => {
        if (run !== this.run) return;
        this.suspend();
        if (!user) { this.update({ status: 'signed-out', user: null, role: null, message: '' }); return; }
        const generation = this.generation;
        this.update({ status: 'authorizing', user, role: null, message: '' });
        this.unsubscribeProfile = this.gateway.watchProfile(user.uid, data => {
          if (generation !== this.generation) return;
          const role = readRole(data);
          this.update({ status: role ? 'authorized' : 'denied', user, role,
            message: role ? '' : 'Sua conta não possui um perfil ativo autorizado. Solicite acesso ao responsável.' });
        }, () => {
          if (generation !== this.generation) return;
          this.update({ status: 'denied', user, role: null,
            message: 'Não foi possível confirmar seu perfil. Verifique a conexão e solicite a revisão das regras de acesso ao responsável.' });
        });
      }, () => {
        if (run !== this.run) return;
        this.suspend();
        this.update({ status: 'error', user: null, role: null, message: 'Não foi possível verificar sua sessão. Tente novamente.' });
      });
    } catch (error) {
      this.update({ status: 'error', user: null, role: null,
        message: error instanceof Error && error.message.startsWith('Configuração Firebase ausente:') ? error.message : 'Não foi possível iniciar a autenticação. Verifique a configuração Firebase.' });
    }
    return this.stop;
  };
  stop = () => {
    this.run++;
    this.generation++;
    this.unsubscribeAuth?.();
    this.unsubscribeProfile?.();
    this.unsubscribeAuth = undefined;
    this.unsubscribeProfile = undefined;
  };
}
