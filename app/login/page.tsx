'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth-provider';
import { SessionActions } from '../../components/session-actions';
import { authenticationMessage, canRead } from '../../lib/access';
import { MAX_REGISTRATION_LENGTH } from '../../lib/registration';

export default function LoginPage() {
  const { session, login, retry } = useAuth();
  const router = useRouter();
  const [registration, setRegistration] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (canRead(session)) router.replace('/'); }, [router, session]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await login(registration, password); }
    catch (error) { setError(authenticationMessage(error)); }
    finally { setPassword(''); setBusy(false); }
  }
  return <main className="body-regulagem login-page"><section className="setup-card login-card">
    <p className="login-brand">LUPOCALIBRA</p>
    <h1>Acesso à linha de embalagem</h1>
    <p className="setup-subtitulo">Entre com sua matrícula e senha para acessar o painel.</p>
    {session.status === 'signed-out' ? <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="setup-campo"><label htmlFor="registration">Matrícula</label><input className="ihm-input" id="registration" name="username" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={MAX_REGISTRATION_LENGTH} autoComplete="username" spellCheck={false} required aria-describedby="registration-help" value={registration} onChange={event => setRegistration(event.target.value.trim())} /><small id="registration-help">Digite somente números, incluindo os zeros iniciais.</small></div>
        <div className="setup-campo"><label htmlFor="password">Senha</label><input className="ihm-input" id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
        <button className="ihm-botao btn-bloco" type="submit">{busy ? 'Entrando…' : 'Entrar'}</button>
      </fieldset>
      <p className="setup-subtitulo">Para criar ou recuperar seu acesso, procure o responsável pelo sistema.</p>
    </form> : session.status === 'denied' || session.status === 'error' ? <>
      <p className="notice-error" role="alert">{session.message}</p>
      <button className="ihm-botao btn-bloco" onClick={retry}>Verificar acesso novamente</button>
      <SessionActions />
    </> : <p role="status">{session.status === 'authorizing' ? 'Verificando autorização…' : 'Verificando sessão…'}</p>}
    {error && <p className="notice-error" role="alert">{error}</p>}
  </section></main>;
}
