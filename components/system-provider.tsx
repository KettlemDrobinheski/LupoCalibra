'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { SystemStore } from '../lib/store';

const Context = createContext<SystemStore | null>(null);

export function SystemProvider({ store, children }: { store: SystemStore; children: ReactNode }) {
  useEffect(() => store.start(), [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSystem() {
  const store = useContext(Context);
  if (!store) throw new Error('SystemProvider ausente.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snapshot, beginSimulation: store.beginSimulation, pauseSimulation: store.pauseSimulation, reset: store.reset, saveConfig: store.saveConfig, reconnect: store.start };
}
