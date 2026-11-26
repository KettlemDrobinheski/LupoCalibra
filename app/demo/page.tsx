'use client';

import { Dashboard } from '../../components/dashboard';
import { useDemo } from '../../components/demo-provider';

export default function DemoPage() {
  return <Dashboard operator allowReset demonstration={useDemo()} />;
}
