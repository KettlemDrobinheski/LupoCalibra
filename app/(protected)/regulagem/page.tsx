import { Suspense } from 'react';
import { Regulation } from '../../../components/regulation';

export default function RegulationPage() {
  return <Suspense fallback={<main className="setup-card">Carregando regulagem…</main>}><Regulation /></Suspense>;
}
