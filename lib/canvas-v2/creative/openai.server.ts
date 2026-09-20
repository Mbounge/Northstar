import { object, string, type JsonObject } from "../managed-agent/protocol";

export class CreativeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** The API key is used only by this client, never uploaded into a sandbox. No automatic POST retries. */
export class CreativeOpenAI {
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    if (!/^\/(?:containers|responses|images)(?:\/|$)/.test(path))
      throw new Error("Invalid creative API route.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.key}`);
    if (typeof init.body === "string")
      headers.set("Content-Type", "application/json");
    const response = await this.fetcher(`https://api.openai.com/v1${path}`, {
      ...init,
      headers,
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      const value = object(await response.json().catch(() => ({})));
      const message = string(object(value.error).message)
        .replaceAll(this.key, "[redacted]")
        .slice(0, 600);
      throw new CreativeApiError(
        response.status,
        `Creative service (${response.status}): ${message || "Request failed."}`,
      );
    }
    return response;
  }
  async json(
    path: string,
    method: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<JsonObject> {
    const response = await this.request(
      path,
      { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
      signal,
    );
    const bytes = await this.bytes(response, 28_000_000);
    return object(JSON.parse(Buffer.from(bytes).toString("utf8")));
  }
  async bytes(response: Response, limit: number): Promise<Uint8Array> {
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw new Error(
        "Creative output exceeds the transfer limit. Export smaller files separately.",
      );
    }
    if (!response.body)
      throw new Error("Creative service returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit)
          throw new Error(
            "Creative output exceeds the transfer limit. Export smaller files separately.",
          );
        chunks.push(value);
      }
    } catch (e) {
      await reader.cancel();
      throw e;
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
}
export function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
