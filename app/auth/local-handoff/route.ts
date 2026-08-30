import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocalSessionHandoff = {
  expiresAt: number;
  cookies: Array<{ name: string; value: string }>;
};

declare global {
  var __northstarLocalSessionHandoffs: Map<string, LocalSessionHandoff> | undefined;
}

const handoffs = globalThis.__northstarLocalSessionHandoffs ?? new Map<string, LocalSessionHandoff>();
globalThis.__northstarLocalSessionHandoffs = handoffs;

function localHandoffEnabled(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NORTHSTAR_E2E === "1" &&
    (request.nextUrl.hostname === "127.0.0.1" || request.nextUrl.hostname === "localhost")
  );
}

function cleanupExpiredHandoffs(now = Date.now()) {
  for (const [code, handoff] of handoffs) {
    if (handoff.expiresAt <= now) handoffs.delete(code);
  }
}

function html(body: string, status = 200) {
  return new NextResponse(`<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northstar local session handoff</title></head><body style="font:16px/1.5 system-ui;padding:40px;max-width:760px;margin:auto;background:#11111b;color:#f6f5ff">${body}</body></html>`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  if (!localHandoffEnabled(request)) return new NextResponse("Not found", { status: 404 });

  cleanupExpiredHandoffs();
  const code = request.nextUrl.searchParams.get("code")?.trim();

  if (code) {
    const handoff = handoffs.get(code);
    handoffs.delete(code);
    if (!handoff || handoff.expiresAt <= Date.now()) {
      return html("<h1>This handoff has expired.</h1><p>Create a new one from the authenticated Chrome session.</p>", 410);
    }

    const redirectUrl = new URL("/canvas?evaluation=9-2-authorized-account-proof", request.url);
    const response = NextResponse.redirect(redirectUrl);
    for (const cookie of handoff.cookies) {
      response.cookies.set(cookie.name, cookie.value, {
        path: "/",
        sameSite: "lax",
        secure: false,
      });
    }
    return response;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return html("<h1>No authenticated Northstar session found.</h1><p>Open this page from the signed-in Chrome tab.</p>", 401);

  const authCookies = request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-") && name.includes("auth-token"))
    .map(({ name, value }) => ({ name, value }));
  if (authCookies.length === 0) return html("<h1>No transferable Northstar session was found.</h1>", 400);

  const handoffCode = randomUUID();
  handoffs.set(handoffCode, {
    expiresAt: Date.now() + 2 * 60 * 1000,
    cookies: authCookies,
  });
  const redemptionUrl = `http://127.0.0.1:${request.nextUrl.port || "3115"}/auth/local-handoff?code=${encodeURIComponent(handoffCode)}`;
  return html(`<h1>Northstar test session is ready.</h1><p>Copy this one-time URL into the Codex browser within two minutes:</p><p style="overflow-wrap:anywhere;padding:16px;border:1px solid #5d58a8;border-radius:12px;background:#1b1930">${redemptionUrl}</p><p>This code works once and the underlying session is held only in server memory.</p>`);
}
