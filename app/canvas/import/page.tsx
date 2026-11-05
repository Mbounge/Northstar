import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CanvasArchiveImport } from './importer';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/signin');
  return <CanvasArchiveImport owner={user.id} />;
}
