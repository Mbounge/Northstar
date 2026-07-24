export const NORTHSTAR_HEALTH_POLICY = {
  schema: "northstar.health-policy.v1",
  version: "2026-07-24",
  action: {
    timeoutMs: 45_000,
    maxAttempts: 3,
    retryBaseDelayMs: 250,
    retryMaxDelayMs: 2_000,
  },
  acknowledgement: {
    terminalTimeoutMs: 30_000,
    maxDispatchAttempts: 40,
    retryBeforeReceiptMs: 400,
    retryAfterReceiptMs: 900,
    pumpIntervalMs: 200,
  },
  render: {
    maxWidthGrowthRatio: 4,
    maxHeightGrowthRatio: 6,
    minimumVisibleDimensionPx: 1,
    requiredNodeIds: ["artboard"] as const,
  },
  recovery: {
    maxJournalAgeMs: 24 * 60 * 60 * 1000,
  },
  diagnostics: {
    maxEvents: 2_000,
    maxDepth: 7,
    maxObjectKeys: 80,
    maxArrayItems: 60,
    maxStringLength: 2_048,
    previewLength: 320,
    sensitiveKeyPattern: "authorization|cookie|password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token",
    bulkyKeyPattern: "compositionJson|workingNotesJson|workingNoteJson|workspacePlanJson|html|css|javascript|document|dataBundle",
  },
} as const;

export type NorthstarHealthPolicy = typeof NORTHSTAR_HEALTH_POLICY;
