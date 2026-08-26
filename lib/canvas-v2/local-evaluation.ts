import type { AppDataCatalog } from "@/lib/app-data/canvas-v2-catalog";

export const CANVAS_V2_LOCAL_EVALUATION_TENANT_ID = "northstar-local-composition-evaluation";

/**
 * Local composition evaluation intentionally exercises the production model
 * boundary without borrowing a developer's account session. The gate is
 * fail-closed in every production build and must be explicitly enabled on a
 * local evaluation process. Authentication bypass remains separately guarded
 * by the proxy's test-harness boundary.
 */
export function canvasV2LocalEvaluationEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.CANVAS_V2_PRODUCTION_EVALUATION === "1";
}

/** An unauthenticated local evaluation may never inherit account evidence. */
export function emptyCanvasV2LocalEvaluationCatalog(): AppDataCatalog {
  return { tenantId: CANVAS_V2_LOCAL_EVALUATION_TENANT_ID, apps: [] };
}
