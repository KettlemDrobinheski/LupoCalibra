import { ProtectedArea } from '../../components/protected-area';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedArea>{children}</ProtectedArea>;
}
