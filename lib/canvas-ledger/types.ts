export type NorthstarLedgerScalar = string | number | boolean | null;

export type NorthstarLedgerValue =
  | NorthstarLedgerScalar
  | readonly NorthstarLedgerValue[]
  | { readonly [key: string]: NorthstarLedgerValue };

export type NorthstarLedgerRunStatus =
  | "active"
  | "completed"
  | "failed"
  | "cancelled";

export type NorthstarLedgerTaskKind =
  | "research"
  | "analysis"
  | "artboard-mutation"
  | "verification"
  | "finalization";

export type NorthstarLedgerTaskStatus =
  | "created"
  | "active"
  | "awaiting-preparation"
  | "awaiting-projection"
  | "awaiting-transport-resolution"
  | "retryable-failure"
  | "blocked"
  | "completed"
  | "cancelled"
  | "superseded";

export type NorthstarLedgerAttemptStatus =
  | "active"
  | "transport-uncertain"
  | "drafted"
  | "prepared"
  | "failed"
  | "cancelled"
  | "completed";

export type NorthstarLedgerFailureKind =
  | "transient"
  | "correctable"
  | "terminal";

export interface NorthstarLedgerFailure {
  kind: NorthstarLedgerFailureKind;
  code: string;
  detail: string;
  phase: "decision" | "execution" | "preparation" | "projection" | "control";
  correctionContext?: NorthstarLedgerValue;
}

/**
 * An LLM activity draft deliberately contains no run, task, attempt or commit identity.
 * The browser-owned ledger assigns all authoritative identity after receiving the draft.
 */
export interface NorthstarActivityDraft {
  kind: NorthstarLedgerTaskKind;
  intent: string;
  expectedOutcome: string;
  executionInput: NorthstarLedgerValue;
}

export interface NorthstarLedgerRun {
  id: string;
  objective: string;
  status: NorthstarLedgerRunStatus;
  headCommitHash: string;
  activeTaskId: string | null;
  nextTaskSequence: number;
  nextCommitSequence: number;
  nextEventSequence: number;
  createdAt: number;
  completedAt?: number;
  failure?: NorthstarLedgerFailure;
}

export interface NorthstarLedgerTask {
  id: string;
  runId: string;
  sequence: number;
  kind: NorthstarLedgerTaskKind;
  intent: string;
  expectedOutcome: string;
  initialExecutionInput: NorthstarLedgerValue;
  status: NorthstarLedgerTaskStatus;
  baseCommitHash: string;
  currentAttemptId: string | null;
  resultCommitHash?: string;
  createdAt: number;
  completedAt?: number;
  cancelledAt?: number;
  supersededAt?: number;
}

export interface NorthstarProjectionReceipt {
  commitHash: string;
  projectedStateHash: string;
  surfaceSessionId: string;
  verified: boolean;
  projectedAt: number;
  metadata?: NorthstarLedgerValue;
}


export interface NorthstarAttemptTransportUncertainty {
  requestId: string;
  code: string;
  detail: string;
  retryable: boolean;
  deliveryAttempts: number;
  firstObservedAt: number;
  lastObservedAt: number;
}

export interface NorthstarAttemptTransportUncertaintyInput {
  requestId: string;
  code: string;
  detail: string;
  retryable: boolean;
}

export interface NorthstarLedgerTaskAttempt {
  id: string;
  runId: string;
  taskId: string;
  attemptNumber: number;
  executionInput: NorthstarLedgerValue;
  status: NorthstarLedgerAttemptStatus;
  preparedResult?: NorthstarLedgerValue;
  /** Read-only evidence retrieved for this attempt and rendered by product UI. */
  evidence?: NorthstarLedgerValue;
  candidateCommitHash?: string;
  candidateStateHash?: string;
  result?: NorthstarLedgerValue;
  stateSnapshot?: NorthstarLedgerValue;
  projectionReceipt?: NorthstarProjectionReceipt;
  transportUncertainty?: NorthstarAttemptTransportUncertainty;
  /**
   * Transient projection failures are retained without invalidating the prepared
   * candidate. Retrying projection must use this same attempt and candidate.
   */
  preparationFailures?: readonly NorthstarLedgerFailure[];
  projectionFailures?: readonly NorthstarLedgerFailure[];
  failure?: NorthstarLedgerFailure;
  startedAt: number;
  draftedAt?: number;
  preparedAt?: number;
  completedAt?: number;
}

export interface NorthstarLedgerCommit {
  hash: string;
  stateHash: string;
  runId: string;
  sequence: number;
  kind: "root" | "task";
  parentHash: string | null;
  taskId: string | null;
  attemptId: string | null;
  taskKind: NorthstarLedgerTaskKind | null;
  result: NorthstarLedgerValue;
  stateSnapshot: NorthstarLedgerValue;
  projectionReceipt?: NorthstarProjectionReceipt;
  createdAt: number;
}

export type NorthstarLedgerEventType =
  | "run.created"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "decision.recorded"
  | "control.failed"
  | "task.created"
  | "task.cancelled"
  | "task.superseded"
  | "attempt.started"
  | "attempt.drafted"
  | "attempt.prepared"
  | "attempt.failed"
  | "attempt.transport-uncertain"
  | "attempt.transport-retrying"
  | "preparation.retrying"
  | "preparation.failed"
  | "projection.retrying"
  | "projection.failed"
  | "commit.created"
  | "task.completed";

export interface NorthstarLedgerEvent {
  sequence: number;
  runId: string;
  taskId?: string;
  attemptId?: string;
  commitHash?: string;
  type: NorthstarLedgerEventType;
  summary: string;
  payload?: NorthstarLedgerValue;
  timestamp: number;
}

export interface NorthstarLedgerState {
  run: NorthstarLedgerRun;
  tasks: readonly NorthstarLedgerTask[];
  attempts: readonly NorthstarLedgerTaskAttempt[];
  commits: readonly NorthstarLedgerCommit[];
  events: readonly NorthstarLedgerEvent[];
}

export interface NorthstarLedgerSnapshot extends NorthstarLedgerState {
  activeTask: NorthstarLedgerTask | null;
  headCommit: NorthstarLedgerCommit;
}

export interface NorthstarLedgerLLMContext {
  schema: "northstar.ledger-context.v1";
  run: {
    id: string;
    objective: string;
    status: NorthstarLedgerRunStatus;
    createdAt: number;
  };
  currentHead: {
    hash: string;
    stateHash: string;
    sequence: number;
    stateSnapshot: NorthstarLedgerValue;
  };
  activeTask: {
    task: NorthstarLedgerTask;
    attempts: readonly NorthstarLedgerTaskAttempt[];
  } | null;
  tasks: readonly NorthstarLedgerTask[];
  attempts: readonly NorthstarLedgerTaskAttempt[];
  commits: readonly NorthstarLedgerCommit[];
  events: readonly NorthstarLedgerEvent[];
  outstandingObligations: readonly string[];
}

export interface NorthstarLedgerExport {
  schema: "northstar.ephemeral-ledger-export.v1";
  exportedAt: number;
  snapshot: NorthstarLedgerSnapshot;
}

export interface NorthstarCommitTaskInput {
  taskId: string;
  attemptId: string;
  result: NorthstarLedgerValue;
  stateSnapshot: NorthstarLedgerValue;
  projectionReceipt?: NorthstarProjectionReceipt;
}

export interface NorthstarPrepareArtboardCommitInput extends NorthstarCommitTaskInput {
  preparedResult: NorthstarLedgerValue;
}

export interface NorthstarEphemeralLedger {
  getSnapshot(): NorthstarLedgerSnapshot;
  subscribe(listener: () => void): () => void;
  recordDecision(summary: string, payload?: NorthstarLedgerValue): void;
  recordControlFailure(failure: NorthstarLedgerFailure, taskId?: string): void;
  createTask(activity: NorthstarActivityDraft): NorthstarLedgerTask;
  startAttempt(taskId: string, executionInput?: NorthstarLedgerValue): NorthstarLedgerTaskAttempt;
  recordArtboardDraft(taskId: string, attemptId: string, draft: NorthstarLedgerValue): void;
  recordAttemptEvidence(taskId: string, attemptId: string, evidence: NorthstarLedgerValue): void;
  recordAttemptTransportUncertain(
    taskId: string,
    attemptId: string,
    uncertainty: NorthstarAttemptTransportUncertaintyInput,
  ): void;
  recordAttemptTransportRetry(taskId: string, attemptId: string, requestId: string): void;
  prepareArtboardCommit(input: NorthstarPrepareArtboardCommitInput): NorthstarLedgerCommit;
  recordAttemptFailure(taskId: string, attemptId: string, failure: NorthstarLedgerFailure): void;
  recordPreparationFailure(taskId: string, attemptId: string, failure: NorthstarLedgerFailure): void;
  recordProjectionFailure(taskId: string, attemptId: string, failure: NorthstarLedgerFailure): void;
  commitTask(input: NorthstarCommitTaskInput): NorthstarLedgerCommit;
  cancelTask(taskId: string, reason: string): void;
  supersedeTask(taskId: string, reason: string): void;
  completeRun(summary?: NorthstarLedgerValue): void;
  failRun(failure: NorthstarLedgerFailure): void;
  cancelRun(reason: string): void;
  exportJSON(): NorthstarLedgerExport;
  dispose(): void;
}
