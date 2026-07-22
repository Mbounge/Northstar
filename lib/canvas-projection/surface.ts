export type NorthstarProjectionSurfaceFailureKind =
  | "transient"
  | "correctable"
  | "terminal";

export class NorthstarProjectionSurfaceError extends Error {
  readonly code: string;
  readonly failureKind: NorthstarProjectionSurfaceFailureKind;
  readonly retryable: boolean;
  readonly outcomeUnknown: boolean;

  constructor(input: {
    code: string;
    message: string;
    failureKind: NorthstarProjectionSurfaceFailureKind;
    retryable?: boolean;
    outcomeUnknown?: boolean;
  }) {
    super(input.message);
    this.name = "NorthstarProjectionSurfaceError";
    this.code = input.code;
    this.failureKind = input.failureKind;
    this.retryable = input.retryable ?? input.failureKind === "transient";
    this.outcomeUnknown = input.outcomeUnknown ?? false;
  }
}

export function projectionSurfaceFailureFromUnknown(
  error: unknown,
  fallback: {
    code: string;
    messagePrefix: string;
    failureKind?: NorthstarProjectionSurfaceFailureKind;
    outcomeUnknown?: boolean;
  },
): NorthstarProjectionSurfaceError {
  if (error instanceof NorthstarProjectionSurfaceError) return error;
  return new NorthstarProjectionSurfaceError({
    code: fallback.code,
    message: `${fallback.messagePrefix}: ${error instanceof Error ? error.message : String(error)}`,
    failureKind: fallback.failureKind ?? "transient",
    outcomeUnknown: fallback.outcomeUnknown ?? false,
  });
}
