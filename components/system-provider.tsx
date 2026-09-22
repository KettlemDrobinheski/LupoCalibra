'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { repository } from '../lib/repository';
import { SystemStore } from '../lib/store';
import { authorizedRepository } from '../lib/authorized-repository';
import { canOperate, canReset } from '../lib/access';
import { useAuth } from './auth-provider';

const Context = createContext<SystemStore | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const { getSession } = useAuth();
  const [store] = useState(() => new SystemStore(authorizedRepository(repository, getSession), () => canOperate(getSession()), () => canReset(getSession())));
  useEffect(() => store.start(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSystem() {
  const store = useContext(Context);
  if (!store) throw new Error('SystemProvider ausente.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snapshot, beginSimulation: store.beginSimulation, reset: store.reset, saveConfig: store.saveConfig, reconnect: store.start };
}
