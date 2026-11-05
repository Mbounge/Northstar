import {notFound} from 'next/navigation';
import {StfxAccessibilityStudio} from '@/app/stfx-accessibility/studio';
export const dynamic='force-dynamic';
export default function Page(){if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();return <StfxAccessibilityStudio/>;}
