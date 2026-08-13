# Phase 7D.2: request reliability

Phase 7D.2 makes transient model-provider and transport failures recoverable
without weakening the lifecycle truth established in Phase 7D.1. It does not
retry commits, iframe rendering, evidence insertion, or manual mutations.

## One logical request

Every routing request has the chat turn ID as its stable request identity. Every
design request has the active run ID plus the exact committed revision ID as its
identity. All attempts reuse the same serialized request body and identity while
carrying a monotonically increasing attempt header.

The retry boundary ends at the API response. A response is materialized into a
candidate only once, after one attempt succeeds and while the original turn and
run still own the request. Timed-out or stopped attempts may finish remotely,
but their response has no authority to create a candidate, insert research, or
commit source.

## Bounded policy

- routing: three attempts, a 30-second browser deadline per attempt, and bounded
  350–1,400ms exponential backoff;
- design: three attempts, a 100-second browser deadline per attempt, and bounded
  500–2,000ms exponential backoff;
- provider calls also have server deadlines shorter than their browser deadline;
- `Retry-After` is honored up to the policy's maximum delay;
- Stop aborts both the active attempt and any pending backoff.

Retryable failures are timeouts, network transport failures, rate limits,
temporary provider failures, and structurally invalid provider responses that
have not been materialized. Authentication, configuration, invalid user input,
and explicit non-transient provider rejections fail immediately.

## Visible truth

During backoff, chat reports the reason and exact next attempt, such as
`Provider busy — retrying request 2 of 3…`. The turn remains actively owned, so
the existing Stop control remains available. After the final failed attempt,
the turn becomes `failed`, the retry indicator disappears, and the latest
committed artboard remains visible.

Retries never masquerade as design turns. They do not increment the automatic
edit count or add entries to visible design progress. Only a rendered, observed,
committed revision creates a design turn.

## Verification boundary

Unit tests cover stable request identity and body, bounded transient recovery,
non-retryable failures, attempt timeouts, provider `Retry-After`, and Stop during
backoff. The deterministic browser harness covers routing recovery, one-candidate
design recovery, exhausted design failure without mutation, and cancellation of
the complete retry chain.

Research coverage belongs to Phase 7D.3. Persistence and manual-edit hardening
belong to Phase 7D.4.
