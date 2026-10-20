import {notFound} from 'next/navigation';
import LayersWindowFixture from './layers-window-fixture';
export default function Page(){if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();return <LayersWindowFixture/>;}
