import {notFound} from 'next/navigation';
import PresentationFixture from './presentation-fixture';
import {HardeningPerformanceObserver} from '../hardening/performance-observer';
export default async function Page({searchParams}:{searchParams:Promise<{hardening?:string}>}){if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();const params=await searchParams;return <><PresentationFixture/>{params.hardening==='1'&&<HardeningPerformanceObserver/>}</>;}
