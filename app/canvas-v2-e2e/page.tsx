import { notFound } from "next/navigation";

import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";

export default function CanvasV2E2EPage() {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") notFound();
  return <CanvasV2Workspace designEndpoint="/canvas-v2-e2e/design" researchEndpoint="/canvas-v2-e2e/research" routerEndpoint="/canvas-v2-e2e/route" />;
}
