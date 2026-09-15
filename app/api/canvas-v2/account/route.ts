import { sameNorthstarOrigin } from '@/lib/canvas-v2/request-origin';
import { createClient } from '@/lib/supabase/server';
import { loadAppDataCatalog, resolveAppDataTenantId } from '@/lib/app-data/canvas-v2-catalog';
import { createCanvasV2AccountEvidenceProvider } from '@/lib/canvas-v2/account-evidence-provider';
import { parseAccountQuery, readAccountTools } from '@/lib/canvas-v2/account-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (request.headers.get('origin') && !sameNorthstarOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in to access your account apps.' }, { status: 401 });
  let query;
  try {
    const body = await request.text();
    if (body.length > 16_000) return Response.json({ error: 'Account query is too large.' }, { status: 413 });
    query = parseAccountQuery(JSON.parse(body));
  } catch { return Response.json({ error: 'Invalid account research request.' }, { status: 400 }); }
  try {
    // Both identity and catalog come from this signed-in account, never from model-supplied tenant IDs.
    const tenantId = await resolveAppDataTenantId(supabase, user.id);
    const catalog = await loadAppDataCatalog(supabase, tenantId);
    const provider = createCanvasV2AccountEvidenceProvider({ supabase, tenantId, catalog });
    return Response.json({ result: await readAccountTools(catalog, query, provider) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Account evidence could not be loaded. Try again.' }, { status: 503 }); }
}
