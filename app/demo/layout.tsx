import type { Metadata } from 'next';
import { DemoProvider } from '../../components/demo-provider';

export const metadata: Metadata = {
  title: 'Demonstração pública | LupoCalibra',
  description: 'Explore o simulador da linha de embalagem com 16 balanças e dados fictícios.',
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
