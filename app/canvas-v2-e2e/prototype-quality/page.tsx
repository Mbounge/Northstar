import { notFound } from 'next/navigation';
import QualityCheck from './quality-check';
export default function QualityPage() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  return <QualityCheck />;
}
