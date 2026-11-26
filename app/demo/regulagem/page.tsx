import { Suspense } from 'react';
import { Regulation } from '../../../components/regulation';

export default function DemoRegulationPage() {
  return <Suspense fallback={<main className="body-regulagem"><p role="status">Carregando regulagem…</p></main>}>
    <Regulation operator demonstration />
  </Suspense>;
}
