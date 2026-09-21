const ACCOUNT_DOMAIN = 'lupocalibra.invalid';
export const MAX_REGISTRATION_LENGTH = 32;

export function normalizeRegistration(value: string): string {
  const registration = value.trim();
  if (!/^[0-9]+$/.test(registration) || registration.length > MAX_REGISTRATION_LENGTH) {
    throw Object.assign(new Error('Matrícula ou senha inválidos.'), { code: 'auth/invalid-credential' });
  }
  return registration;
}

export function registrationEmail(value: string): string {
  return `${normalizeRegistration(value)}@${ACCOUNT_DOMAIN}`;
}

export function registrationFromEmail(email: string | null): string | null {
  if (!email) return null;
  const match = /^([0-9]{1,32})@lupocalibra\.invalid$/i.exec(email);
  return match?.[1] ?? null;
}
