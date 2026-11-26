'use client';

import { Dashboard } from '../../../components/dashboard';
import { useAuth } from '../../../components/auth-provider';
import { SessionActions } from '../../../components/session-actions';
import { canOperate, canReset } from '../../../lib/access';

export default function DashboardPage() {
  const { session } = useAuth();
  return <Dashboard operator={canOperate(session)} allowReset={canReset(session)} sessionActions={<SessionActions />} />;
}
