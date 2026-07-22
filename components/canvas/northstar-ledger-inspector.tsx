"use client";

import type { NorthstarWorkspaceRuntimeSnapshot } from "@/lib/canvas-architecture/northstar-workspace-runtime";

function short(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function NorthstarLedgerInspector({
  snapshot,
}: {
  snapshot: NorthstarWorkspaceRuntimeSnapshot;
}) {
  const ledger = snapshot.ledger;
  if (!ledger) return null;

  return (
    <section
      data-testid="northstar-ledger-inspector"
      aria-label="Northstar ledger inspector"
      className="mt-3 rounded-2xl border border-black/[0.07] bg-white/72 p-3 text-[10px] text-zinc-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300"
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[11px] font-[900] text-zinc-900 dark:text-white">Ledger inspector</strong>
        <span className="rounded-full bg-[#6B5CFF]/10 px-2 py-1 font-[850] text-[#5B4BFF] dark:text-[#C8C2FF]">
          {snapshot.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[54px_1fr] gap-x-2 gap-y-1">
        <span className="font-[850] text-zinc-400">Run</span>
        <span>{short(ledger.run.id)} · {ledger.run.status} · HEAD {short(ledger.run.headCommitHash)}</span>
        <span className="font-[850] text-zinc-400">Task</span>
        <span>{ledger.activeTask ? `${ledger.activeTask.sequence}. ${ledger.activeTask.intent} · ${ledger.activeTask.status}` : "No unresolved task"}</span>
      </div>

      <div className="mt-3 space-y-2">
        {ledger.tasks.map((task) => {
          const attempts = ledger.attempts.filter((attempt) => attempt.taskId === task.id);
          return (
            <div key={task.id} className="rounded-xl border border-black/[0.05] bg-white/65 p-2 dark:border-white/10 dark:bg-black/10">
              <div className="font-[850] text-zinc-800 dark:text-zinc-100">
                T{task.sequence} · {task.kind} · {task.status}
              </div>
              <div className="mt-1 text-zinc-500 dark:text-zinc-400">{task.intent}</div>
              {attempts.map((attempt) => (
                <div key={attempt.id} className="mt-1 pl-2">
                  A{attempt.attemptNumber} · {attempt.status}
                  {attempt.failure ? ` · ${attempt.failure.kind}:${attempt.failure.code}` : ""}
                  {attempt.candidateCommitHash ? ` · candidate ${short(attempt.candidateCommitHash)}` : ""}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="font-[850] text-zinc-400">Commits</div>
        <div className="mt-1 space-y-1">
          {ledger.commits.slice(-6).map((commit) => (
            <div key={commit.hash}>
              H{commit.sequence} · {commit.kind} · {short(commit.hash)}
              {commit.projectionReceipt?.verified ? " · projection verified" : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="font-[850] text-zinc-400">Events</div>
        <div className="mt-1 max-h-36 space-y-1 overflow-y-auto font-mono text-[9px]">
          {ledger.events.slice(-16).map((event) => (
            <div key={event.sequence}>#{event.sequence} {event.type} — {event.summary}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
