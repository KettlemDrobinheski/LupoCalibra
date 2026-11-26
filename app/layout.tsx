import type { Metadata } from 'next';
import '../style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LupoCalibra — Linha de Embalagem BL Export',
  description: 'Sistema de Integridade do Desviador de Alta Velocidade',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
