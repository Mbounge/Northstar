import assert from "node:assert/strict";
import test from "node:test";
import { NorthstarSingleRuntimeAuthority } from "@/lib/canvas-ai/northstar-single-runtime-authority";

type Revision = { revisionId: string; value: string };
type Receipt = { revisionId: string; status: "applied" };

test("a rejected candidate cannot replace the accepted browser revision", () => {
  const accepted = { revisionId: "revision-1", value: "visible" };
  const authority = new NorthstarSingleRuntimeAuthority<Revision, Receipt>(accepted);

  authority.stage({
    proposalId: "proposal-2",
    baseRevisionId: "revision-1",
    candidateRevisionId: "revision-2",
    value: { revisionId: "revision-2", value: "speculative" },
  });
  authority.dispatched("proposal-2");
  authority.reject({
    proposalId: "proposal-2",
    browserRevisionId: "revision-1",
    detail: "Candidate geometry was invalid.",
  });

  const snapshot = authority.snapshot();
  assert.equal(snapshot.phase, "candidate-rejected");
  assert.equal(snapshot.accepted, accepted);
  assert.equal(snapshot.staged, undefined);
  assert.deepEqual(snapshot.events.map((event) => event.kind), [
    "candidate.staged",
    "candidate.dispatched",
    "candidate.rejected",
  ]);
});

test("only the exact browser revision can commit a staged candidate", () => {
  const authority = new NorthstarSingleRuntimeAuthority<Revision, Receipt>({
    revisionId: "revision-1",
    value: "visible",
  });
  authority.stage({
    proposalId: "proposal-2",
    baseRevisionId: "revision-1",
    candidateRevisionId: "revision-2",
    value: { revisionId: "revision-2", value: "candidate" },
  });

  assert.throws(
    () => authority.commit({
      proposalId: "proposal-2",
      browserRevisionId: "revision-stale",
      accepted: { revisionId: "revision-2", value: "candidate" },
      receipt: { revisionId: "revision-stale", status: "applied" },
    }),
    /does not match candidate revision/,
  );
  assert.equal(authority.snapshot().accepted?.revisionId, "revision-1");

  authority.commit({
    proposalId: "proposal-2",
    browserRevisionId: "revision-2",
    accepted: { revisionId: "revision-2", value: "candidate" },
    receipt: { revisionId: "revision-2", status: "applied" },
  });
  assert.equal(authority.snapshot().phase, "committed");
  assert.equal(authority.snapshot().accepted?.revisionId, "revision-2");
});
