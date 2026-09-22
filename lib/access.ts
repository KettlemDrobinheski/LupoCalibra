export type Role = 'ADMIN' | 'OPERADOR';
export type SessionUser = { uid: string; email: string | null };
export type Session = {
  status: 'loading' | 'signed-out' | 'authorizing' | 'authorized' | 'denied' | 'error';
  user: SessionUser | null;
  role: Role | null;
  message: string;
};

export function readRole(data: unknown): Role | null {
  if (!data || typeof data !== 'object') return null;
  const profile = data as Record<string, unknown>;
  return profile.active === true && (profile.role === 'ADMIN' || profile.role === 'OPERADOR') ? profile.role : null;
}

export function canRead(session: Session) {
  return session.status === 'authorized' && !!session.user && (session.role === 'ADMIN' || session.role === 'OPERADOR');
}

export function canOperate(session: Session) {
  return canRead(session) && session.role === 'OPERADOR';
}

export function canReset(session: Session) {
  return canOperate(session);
}

export function requireAccess(session: Session, write = false) {
  if (write ? !canOperate(session) : !canRead(session)) throw new Error('Operação não autorizada para esta sessão.');
}

export function authenticationMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email': return 'Matrícula ou senha inválidos.';
    case 'auth/user-disabled': return 'Conta desativada. Procure o responsável pelo sistema.';
    case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde antes de tentar novamente.';
    case 'auth/network-request-failed': return 'Não foi possível conectar. Verifique a conexão e tente novamente.';
    case 'auth/operation-not-allowed': return 'Login por e-mail e senha ainda não está habilitado no Firebase.';
    case 'auth/unauthorized-domain': return 'Este domínio ainda não foi autorizado no Firebase Authentication.';
    default: return 'Não foi possível concluir a autenticação. Verifique a configuração ou procure o responsável.';
  }
}
