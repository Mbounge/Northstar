import {notFound} from 'next/navigation';
import {SnapshotTransportFixture} from './snapshot-transport-fixture';

export default function Page(){
 if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
 return <SnapshotTransportFixture/>;
}
