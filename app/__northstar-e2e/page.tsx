import { notFound } from "next/navigation";
import { NorthstarArtboardE2EHarness } from "@/components/canvas/testing/northstar-artboard-e2e-harness";

export const dynamic = "force-dynamic";

export default function NorthstarE2EPage() {
  if (process.env.NORTHSTAR_E2E !== "1") notFound();
  return <NorthstarArtboardE2EHarness />;
}