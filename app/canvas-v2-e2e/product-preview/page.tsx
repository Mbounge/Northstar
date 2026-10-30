import { notFound } from 'next/navigation';
import { ProductAppPreview } from '@/components/preview/product-app-preview';
import { MeditoReplica } from '@/components/preview/medito-replica';
import { GraetReplica } from '@/components/preview/graet-replica';

/** Local presentation proof. Never reads accounts or calls a model provider. */
export default async function ProductPreviewFixture({ searchParams }: { searchParams: Promise<{ app?: string; surface?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  const params = await searchParams;
  const appName = params.app === 'GRAET' ? 'GRAET' : 'Medito';
  if (params.surface === 'simulation') {
    // The presentation check exercises native onboarding only; it does not
    // supply or invent the protected Home capture used by the real account page.
    return appName === 'Medito' ? <MeditoReplica screenshots={{}} demoCode="123456" embedded /> : <GraetReplica embedded />;
  }
  return <main className="min-h-screen px-4 py-8 sm:px-8"><ProductAppPreview appName={appName} active /></main>;
}
