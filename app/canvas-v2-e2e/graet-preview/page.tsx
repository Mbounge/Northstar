import { notFound } from 'next/navigation';
import { GraetReplica } from '@/components/preview/graet-replica';
export default function GraetPreviewFixture(){
 if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
 return <GraetReplica embedded canvas />;
}
