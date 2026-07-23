"use client";

import { useState, type SyntheticEvent } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import { serializeNorthstarRunDiagnosticBundle } from "@/lib/canvas-architecture/northstar-run-diagnostics";
import type {
  NorthstarLedgerFailure,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";

function short(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function visibleJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function latestAttemptFailure(attempt: NorthstarLedgerTaskAttempt): NorthstarLedgerFailure | undefined {
  return attempt.failure
    ?? attempt.projectionFailures?.at(-1)
    ?? attempt.preparationFailures?.at(-1);
}

function correctionRecord(failure: NorthstarLedgerFailure | undefined): Readonly<Record<string, unknown>> | null {
  return isRecord(failure?.correctionContext) ? failure.correctionContext : null;
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was not available.");
}

function DetailBlock({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value === undefined) return null;
  return (
    <details
      open={open}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}
      className="rounded-lg border border-black/[0.05] bg-black/[0.025] p-2 dark:border-white/10 dark:bg-white/[0.025]"
    >
      <summary className="cursor-pointer select-none font-[850] text-zinc-500 dark:text-zinc-300">
        {label}
      </summary>
      {open && (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[8px] leading-[12px] text-zinc-600 dark:text-zinc-300">
          {visibleJson(value)}
        </pre>
      )}
    </details>
  );
}

export function NorthstarLedgerInspector({
  snapshot,
}: {
  snapshot: NorthstarWorkspaceRuntimeSnapshot;
}) {
  const ledger = snapshot.ledger;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  if (!ledger) return null;

  const visualCommits = ledger.commits.filter(
    (commit) => commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true,
  );
  const latestFailureAttempt = [...ledger.attempts].reverse().find((attempt) => latestAttemptFailure(attempt));
  const latestFailure = latestFailureAttempt ? latestAttemptFailure(latestFailureAttempt) : undefined;
  const latestCorrection = correctionRecord(latestFailure);

  const copyDiagnostics = async () => {
    setCopyState("idle");
    try {
      const text = serializeNorthstarRunDiagnosticBundle(snapshot, {
        browser: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          online: navigator.onLine,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          },
          location: window.location.pathname,
        },
        featureFlags: {
          totalArchitecture: process.env.NEXT_PUBLIC_NORTHSTAR_TOTAL_ARCHITECTURE === "true",
          debugInspector: process.env.NEXT_PUBLIC_NORTHSTAR_DEBUG_INSPECTOR === "true",
        },
      });
      await writeClipboard(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section
      data-testid="northstar-ledger-inspector"
      aria-label="Northstar ledger inspector"
      className="mt-3 rounded-2xl border border-black/[0.07] bg-white/72 p-3 text-[10px] text-zinc-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300"
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[11px] font-[900] text-zinc-900 dark:text-white">Ledger inspector</strong>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-2 py-1 font-[850] text-zinc-600 transition hover:bg-white dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-200"
            title="Copy the complete run, attempts, failures, hashes, projection diagnostics, and events as JSON"
            aria-label="Copy complete Northstar run diagnostics"
          >
            {copyState === "copied" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy run JSON"}
          </button>
          <span className="rounded-full bg-[#6B5CFF]/10 px-2 py-1 font-[850] text-[#5B4BFF] dark:text-[#C8C2FF]">
            {snapshot.status}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[8px] leading-[11px] text-zinc-400">
        Copy includes the complete ledger, prompt/result payloads, evidence metadata and URLs, browser state, and projection diagnostics. Share it privately.
      </p>

      <div className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1">
        <span className="font-[850] text-zinc-400">Run</span>
        <span>{short(ledger.run.id)} · {ledger.run.status}</span>
        <span className="font-[850] text-zinc-400">HEAD</span>
        <span>{short(ledger.run.headCommitHash)} · state {short(ledger.headCommit.stateHash)}</span>
        <span className="font-[850] text-zinc-400">Progress</span>
        <span>{ledger.tasks.filter((task) => task.status === "completed").length}/{ledger.tasks.length} tasks · {ledger.commits.filter((commit) => commit.kind === "task").length} ledger commits · {visualCommits.length} verified visual commits</span>
        <span className="font-[850] text-zinc-400">Task</span>
        <span>{ledger.activeTask ? `${ledger.activeTask.sequence}. ${ledger.activeTask.intent} · ${ledger.activeTask.status}` : "No unresolved task"}</span>
        <span className="font-[850] text-zinc-400">Host</span>
        <span>
          {snapshot.projectionHost?.status ?? "unknown"}
          {snapshot.projectionHost?.surfaceSessionId ? ` · ${short(snapshot.projectionHost.surfaceSessionId)}` : ""}
          {snapshot.projectionHost?.stateHash ? ` · ${short(snapshot.projectionHost.stateHash)}` : ""}
        </span>
      </div>

      {latestFailure && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-2">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="font-[900]">{latestFailure.code} · {latestFailure.phase} · {latestFailure.kind}</div>
              <div className="mt-1 leading-[14px]">{latestFailure.detail}</div>
            </div>
          </div>
          {latestCorrection && (
            <div className="mt-2 grid grid-cols-[82px_1fr] gap-x-2 gap-y-1 text-[9px]">
              {typeof latestCorrection.expectedBaseStateHash === "string" && <><span className="font-[850] text-zinc-400">Expected base</span><span>{latestCorrection.expectedBaseStateHash}</span></>}
              {typeof latestCorrection.expectedTargetStateHash === "string" && <><span className="font-[850] text-zinc-400">Expected target</span><span>{latestCorrection.expectedTargetStateHash}</span></>}
              {typeof latestCorrection.actualStateHash === "string" && <><span className="font-[850] text-zinc-400">Actual live</span><span>{latestCorrection.actualStateHash}</span></>}
              {typeof latestCorrection.surfaceSessionId === "string" && <><span className="font-[850] text-zinc-400">Surface</span><span>{latestCorrection.surfaceSessionId}</span></>}
              {isRecord(latestCorrection.firstDifferenceFromBase) && <><span className="font-[850] text-zinc-400">First diff</span><span>{String(latestCorrection.firstDifferenceFromBase.path ?? "unknown")}</span></>}
            </div>
          )}
          <div className="mt-2 space-y-1">
            <DetailBlock label="Failure correction context" value={latestFailure.correctionContext} />
            <DetailBlock label="Failed attempt" value={latestFailureAttempt} />
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {ledger.tasks.map((task) => {
          const attempts = ledger.attempts.filter((attempt) => attempt.taskId === task.id);
          return (
            <details key={task.id} open={task.status === "active" || task.status === "blocked"} className="rounded-xl border border-black/[0.05] bg-white/65 p-2 dark:border-white/10 dark:bg-black/10">
              <summary className="cursor-pointer select-none">
                <span className="font-[850] text-zinc-800 dark:text-zinc-100">
                  T{task.sequence} · {task.kind} · {task.status}
                </span>
                <span className="mt-1 block text-zinc-500 dark:text-zinc-400">{task.intent}</span>
              </summary>
              <div className="mt-2 space-y-2">
                <DetailBlock label="Task authority" value={task} />
                {attempts.map((attempt) => {
                  const failure = latestAttemptFailure(attempt);
                  return (
                    <div key={attempt.id} className="rounded-lg border border-black/[0.04] bg-white/55 p-2 dark:border-white/10 dark:bg-black/10">
                      <div className="font-[850]">
                        A{attempt.attemptNumber} · {attempt.status}
                        {failure ? ` · ${failure.kind}:${failure.code}` : ""}
                        {attempt.candidateCommitHash ? ` · candidate ${short(attempt.candidateCommitHash)}` : ""}
                      </div>
                      <div className="mt-2 space-y-1">
                        <DetailBlock label="Execution input" value={attempt.executionInput} />
                        <DetailBlock label="Evidence" value={attempt.evidence} />
                        <DetailBlock label="Prepared result" value={attempt.preparedResult} />
                        <DetailBlock label="Result" value={attempt.result} />
                        <DetailBlock label="Projection receipt" value={attempt.projectionReceipt} />
                        <DetailBlock label="Preparation failures" value={attempt.preparationFailures} />
                        <DetailBlock label="Projection failures" value={attempt.projectionFailures} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="font-[850] text-zinc-400">Commits</div>
        <div className="mt-1 space-y-1">
          {ledger.commits.map((commit) => (
            <DetailBlock
              key={commit.hash}
              label={`H${commit.sequence} · ${commit.kind}${commit.taskKind ? `:${commit.taskKind}` : ""} · ${short(commit.hash)} · state ${short(commit.stateHash)}${commit.projectionReceipt?.verified ? " · visual projection verified" : ""}`}
              value={commit}
            />
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="font-[850] text-zinc-400">Events · {ledger.events.length}</div>
        <div className="mt-1 max-h-48 space-y-1 overflow-y-auto font-mono text-[9px]">
          {ledger.events.map((event) => event.payload === undefined ? (
            <div key={event.sequence}>#{event.sequence} {event.type} — {event.summary}</div>
          ) : (
            <DetailBlock
              key={event.sequence}
              label={`#${event.sequence} ${event.type} — ${event.summary}`}
              value={event.payload}
            />
          ))}
        </div>
      </div>

    </section>
  );
}
