import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return new NextResponse(null, { status: 404 });
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "mp4" && type !== "gif") return new NextResponse(null, { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), "e2e/fixtures/media", `canvas-motion.${type}`));
  return new NextResponse(bytes, { headers: { "content-type": type === "gif" ? "image/gif" : "video/mp4", "cache-control": "no-store" } });
}
