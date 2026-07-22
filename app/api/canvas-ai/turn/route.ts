import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeNorthstarTurn } from "@/lib/canvas-ai/northstar-turn-executor";
import { createNorthstarGeminiTurnModel } from "@/lib/canvas-ai/northstar-turn-gemini";
import { createNorthstarDataTurnToolExecutor } from "@/lib/canvas-ai/northstar-turn-data-tools";
import { loadNorthStarDataCatalog, resolveNorthStarTenantId } from "@/lib/canvas-ai/northstar-data-tools";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  type NorthstarTurnErrorResponse,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  NorthstarTurnValidationError,
  parseNorthstarTurnRequest,
} from "@/lib/canvas-ai/northstar-turn-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function errorResponse(input: {
  requestId?: string;
  code: string;
  message: string;
  retryable: boolean;
  status: number;
}): NextResponse<NorthstarTurnErrorResponse> {
  return NextResponse.json({
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: input.requestId ?? "turnreq:unavailable",
    type: "turn-error",
    code: input.code,
    message: input.message,
    retryable: input.retryable,
  }, { status: input.status });
}

function possibleRequestId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length >= 8 && requestId.length <= 128
    ? requestId
    : undefined;
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse({
      code: "INVALID_JSON",
      message: "The stateless turn request body must be valid JSON.",
      retryable: false,
      status: 400,
    });
  }
  const requestId = possibleRequestId(rawBody);

  if (process.env.NORTHSTAR_STATELESS_TURNS !== "true") {
    return errorResponse({
      requestId,
      code: "STATELESS_TURNS_DISABLED",
      message: "The Phase 2 stateless turn endpoint is not enabled on this server.",
      retryable: false,
      status: 503,
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse({
      requestId,
      code: "AUTHENTICATION_REQUIRED",
      message: "You must be signed in to use Northstar stateless turns.",
      retryable: false,
      status: 401,
    });
  }

  let turnRequest;
  try {
    turnRequest = parseNorthstarTurnRequest(rawBody);
  } catch (error) {
    if (error instanceof NorthstarTurnValidationError) {
      return errorResponse({
        requestId: possibleRequestId(rawBody),
        code: error.code,
        message: error.message,
        retryable: false,
        status: 400,
      });
    }
    throw error;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse({
      requestId: turnRequest.requestId,
      code: "GEMINI_NOT_CONFIGURED",
      message: "GEMINI_API_KEY is not configured on the server.",
      retryable: false,
      status: 500,
    });
  }

  let catalogPromise: ReturnType<typeof loadNorthStarDataCatalog> | undefined;
  const response = await executeNorthstarTurn({
    request: turnRequest,
    model: createNorthstarGeminiTurnModel({ apiKey }),
    toolExecutor: createNorthstarDataTurnToolExecutor({
      getCatalog() {
        if (!catalogPromise) {
          catalogPromise = resolveNorthStarTenantId(supabase, user.id).then((tenantId) =>
            loadNorthStarDataCatalog(supabase, tenantId),
          );
        }
        return catalogPromise;
      },
    }),
    signal: request.signal,
  });

  const status = response.type === "turn-error"
    ? response.retryable ? 503 : 422
    : 200;
  return NextResponse.json(response, { status });
}
