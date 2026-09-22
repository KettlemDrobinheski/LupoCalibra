import { requireAccess, type Session } from './access.ts';
import type { Repository } from './repository.ts';

export function authorizedRepository(repo: Repository, session: () => Session): Repository {
  const owner = session().user?.uid;
  function check(write = false) {
    const current = session();
    requireAccess(current, write);
    if (!owner || current.user?.uid !== owner) throw new Error('A sessão original foi encerrada.');
  }
  return {
    watchConfigs(receive, fail) { check(); return repo.watchConfigs(receive, fail); },
    watchProduction(receive, fail) { check(); return repo.watchProduction?.(receive, fail) ?? (() => {}); },
    async saveConfig(id, config) { check(true); await repo.saveConfig(id, config); },
    async persist(state, reset, expectedResetToken) { check(true); await repo.persist(state, reset, expectedResetToken); },
  };
}
