import { notFound } from 'next/navigation';
import Monitor from './monitor';
export default function Page() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  return <Monitor />;
}
