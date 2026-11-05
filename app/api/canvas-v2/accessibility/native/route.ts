import {sameNorthstarOrigin} from '@/lib/canvas-v2/request-origin';
import {canvasV2DeterministicEvaluationEnabled} from '@/e2e/canvas-v2-deterministic-evaluation';
import {createClient} from '@/lib/supabase/server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:Request){
 if(process.env.VERCEL||process.env.NORTHSTAR_WORKER_URL)return Response.json({error:'Connect through the authorized accessibility worker.'},{status:503});
 let origin:URL;try{origin=new URL(request.headers.get('origin')??request.url);}catch{return Response.json({error:'Invalid origin.'},{status:403});}
 const localEvaluation=canvasV2DeterministicEvaluationEnabled()&&['localhost','127.0.0.1'].includes(origin.hostname)&&request.headers.get('host')===origin.host;
 if(!localEvaluation){
  if(!sameNorthstarOrigin(request))return Response.json({error:'Invalid origin.'},{status:403});
  const client=await createClient();if(!(await client.auth.getUser()).data.user)return Response.json({error:'Sign in to continue.'},{status:401});
 }
 try{const text=await request.text();if(text.length>9_000_000)return Response.json({error:'Native inspection is too large.'},{status:413});const response=await fetch('http://127.0.0.1:3150/accessibility',{method:'POST',headers:{'Content-Type':'application/json','X-Northstar-Local-Evaluation':'1'},body:text,signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Native accessibility verification did not complete.'},{status:400});}
}
