import { notFound } from 'next/navigation';
import CropInspectionCheck from './crop-check';

export default function CropInspectionPage() {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  return <CropInspectionCheck />;
}
