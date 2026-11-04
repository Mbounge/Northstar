import { notFound } from 'next/navigation';
import { AccessibilityHarnessDemo } from './demo';
export default function AccessibilityProofPage(){
  if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')notFound();
  return <AccessibilityHarnessDemo/>;
}
