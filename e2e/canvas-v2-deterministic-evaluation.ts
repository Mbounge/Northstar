/** Reuse the existing fixture endpoints on /canvas for direct browser QA.
 * Both local test flags are required; production can never select fixtures. */
export function canvasV2DeterministicEvaluationEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.NORTHSTAR_E2E === "1"
    && environment.CANVAS_V2_DETERMINISTIC_EVALUATION === "1";
}


/** Real Codex transport through /canvas, only in an explicit loopback dev test. */
export function canvasV2LocalCodexEvaluationAllowed(request: Request, environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!['development', 'test'].includes(environment.NODE_ENV ?? '') || environment.NORTHSTAR_E2E !== '1' || environment.NORTHSTAR_CODEX_LIVE_TEST !== '1') return false;
  try {
    // Next may use its internal hostname in request.url; authenticate the
    // browser origin against the actual Host header, as the isolated route does.
    const url = new URL(request.headers.get('origin') ?? '');
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && request.headers.get('origin') === url.origin
      && request.headers.get('host') === url.host;
  } catch { return false; }
}
