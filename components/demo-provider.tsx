'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createDemo } from '../lib/demo';
import { SystemProvider } from './system-provider';

const DemoContext = createContext<ReturnType<typeof createDemo> | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo] = useState(createDemo);
  return <DemoContext.Provider value={demo}>
    <SystemProvider store={demo.store}>{children}</SystemProvider>
  </DemoContext.Provider>;
}

export function useDemo() {
  const demo = useContext(DemoContext);
  if (!demo) throw new Error('DemoProvider ausente.');
  return demo;
}
