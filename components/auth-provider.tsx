'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { authGateway, login, logout } from '../lib/auth-gateway';
import { SessionController } from '../lib/session';

const Context = createContext<SessionController | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new SessionController(authGateway));
  useEffect(() => controller.start(), [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}

export function useAuth() {
  const controller = useContext(Context);
  if (!controller) throw new Error('AuthProvider ausente.');
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return {
    session, getSession: controller.getSnapshot, retry: controller.start, login,
    logout: async () => {
      controller.suspend();
      try { await logout(); } finally { controller.start(); }
    },
  };
}
