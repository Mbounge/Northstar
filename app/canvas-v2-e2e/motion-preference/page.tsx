import {notFound} from 'next/navigation';
import PreferenceCheck from './preference-check';
export default function Page(){if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();return <PreferenceCheck/>;}
