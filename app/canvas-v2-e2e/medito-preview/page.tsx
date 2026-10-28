import { notFound } from "next/navigation";
import { MeditoReplica } from "@/components/preview/medito-replica";
export default function MeditoPreviewFixture() {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") notFound();
  const source = process.env.NORTHSTAR_MEDITO_CAPTURE_ROOT;
  if (!source) notFound();
  return <MeditoReplica screenshots={{16: `${source}/screen_0016.png`}} demoCode="123456" />;
}
