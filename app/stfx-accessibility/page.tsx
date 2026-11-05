import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {StfxAccessibilityStudio} from './studio';
export const dynamic='force-dynamic';
export default async function Page(){
 if(process.env.NODE_ENV!=='production'&&process.env.NORTHSTAR_E2E==='1')return <StfxAccessibilityStudio/>;
 const client=await createClient(),{data:{user}}=await client.auth.getUser();if(!user)redirect('/signin');
 return <StfxAccessibilityStudio owner={user.id}/>;
}
