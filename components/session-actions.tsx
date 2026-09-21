'use client';

import { useState } from 'react';
import { authenticationMessage } from '../lib/access';
import { useAuth } from './auth-provider';
import { registrationFromEmail } from '../lib/registration';

export function SessionActions() {
  const { session, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const registration = registrationFromEmail(session.user?.email ?? null);
  return <div className="session-actions">
    <span>{registration ? `Matrícula ${registration}` : session.user ? 'Conta autenticada' : ''} {session.role && `· ${session.role}`}</span>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await logout(); } catch (error) { setError(authenticationMessage(error)); }
      finally { setBusy(false); }
    }}>{busy ? 'Saindo…' : 'Sair'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
