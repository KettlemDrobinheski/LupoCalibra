'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { canRead, canOperate, canReset } from '../lib/access';
import { repository } from '../lib/repository';
import { authorizedRepository } from '../lib/authorized-repository';
import { SystemStore } from '../lib/store';
import { AUTHENTICATED_DEVIATION_CHANCE } from '../lib/production';
import { useAuth } from './auth-provider';
import { SystemProvider } from './system-provider';
import { SessionActions } from './session-actions';

function OperationalSystem({ children }: { children: ReactNode }) {
  const { getSession } = useAuth();
  const [store] = useState(() => new SystemStore(
    authorizedRepository(repository, getSession), () => canOperate(getSession()), () => canReset(getSession()),
    AUTHENTICATED_DEVIATION_CHANCE,
  ));
  return <SystemProvider store={store}>{children}</SystemProvider>;
}

export function ProtectedArea({ children }: { children: ReactNode }) {
  const { session, retry } = useAuth();
  const router = useRouter();
  useEffect(() => { if (session.status === 'signed-out') router.replace('/login'); }, [router, session.status]);
  if (!canRead(session)) return <main className="body-regulagem"><section className="setup-card">
    <h1>LupoCalibra</h1>
    {session.status === 'denied' || session.status === 'error' ? <>
      <p className="notice-error" role="alert">{session.message}</p>
      <button className="ihm-botao btn-bloco" onClick={retry}>Verificar acesso novamente</button>
      <SessionActions />
    </> : <p role="status">{session.status === 'authorizing' ? 'Verificando autorização…' : 'Verificando sessão…'}</p>}
  </section></main>;
  return <OperationalSystem key={`${session.user!.uid}:${session.role}`}>{children}</OperationalSystem>;
}
