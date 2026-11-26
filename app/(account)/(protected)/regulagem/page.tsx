'use client';

import { Suspense } from 'react';
import { Regulation } from '../../../../components/regulation';
import { useAuth } from '../../../../components/auth-provider';
import { SessionActions } from '../../../../components/session-actions';
import { canOperate } from '../../../../lib/access';

export default function RegulationPage() {
  const { session } = useAuth();
  return <Suspense fallback={<main className="setup-card">Carregando regulagem…</main>}>
    <Regulation operator={canOperate(session)} sessionActions={<SessionActions />} />
  </Suspense>;
}
