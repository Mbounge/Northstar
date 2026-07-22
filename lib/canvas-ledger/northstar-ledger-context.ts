import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerSnapshot,
} from "@/lib/canvas-ledger/types";

export function createNorthstarLedgerLLMContext(
  snapshot: NorthstarLedgerSnapshot,
): NorthstarLedgerLLMContext {
  const activeTask = snapshot.activeTask
    ? {
        task: { ...snapshot.activeTask },
        attempts: snapshot.attempts
          .filter((attempt) => attempt.taskId === snapshot.activeTask?.id)
          .map((attempt) => ({ ...attempt })),
      }
    : null;

  const outstandingObligations = activeTask
    ? [
        activeTask.task.expectedOutcome,
        ...(activeTask.attempts
          .filter((attempt) => attempt.failure)
          .map((attempt) =>
            `Resolve ${attempt.failure?.code}: ${attempt.failure?.detail}`,
          )),
        ...(activeTask.task.status === "awaiting-preparation"
          ? ["Prepare and project the recorded artboard mutation draft before requesting another LLM decision."]
          : []),
        ...(activeTask.task.status === "awaiting-transport-resolution"
          ? ["Resolve the uncertain transport delivery by resending the exact request ID for the current attempt before progressing."]
          : []),
        ...(activeTask.attempts.flatMap((attempt) =>
          (attempt.preparationFailures ?? []).map((failure) =>
            `Retry preparation of the same draft after ${failure.code}: ${failure.detail}`,
          )
        )),
        ...(activeTask.attempts.flatMap((attempt) =>
          (attempt.projectionFailures ?? []).map((failure) =>
            `Confirm projection after ${failure.code}: ${failure.detail}`,
          )
        )),
      ]
    : [];

  return {
    schema: "northstar.ledger-context.v1",
    run: {
      id: snapshot.run.id,
      objective: snapshot.run.objective,
      status: snapshot.run.status,
      createdAt: snapshot.run.createdAt,
    },
    currentHead: {
      hash: snapshot.headCommit.hash,
      stateHash: snapshot.headCommit.stateHash,
      sequence: snapshot.headCommit.sequence,
      stateSnapshot: snapshot.headCommit.stateSnapshot,
    },
    activeTask,
    tasks: snapshot.tasks.map((task) => ({ ...task })),
    attempts: snapshot.attempts.map((attempt) => ({ ...attempt })),
    commits: snapshot.commits.map((commit) => ({ ...commit })),
    events: snapshot.events.map((event) => ({ ...event })),
    outstandingObligations,
  };
}
