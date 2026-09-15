import { sameNorthstarOrigin } from '@/lib/canvas-v2/request-origin';
import { createClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !sameNorthstarOrigin(request)) return new Response(null,{status:403});
  const db = await createClient();
  const {data:{user}} = await db.auth.getUser();
  if (!user) return new Response(null,{status:401});
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== 'string' || typeof body.writer !== 'string') return new Response(null,{status:400});
  const {error} = await db.rpc('northstar_session_release',{sid:body.id,writer:body.writer});
  return new Response(null,{status:error ? 400 : 204});
}
