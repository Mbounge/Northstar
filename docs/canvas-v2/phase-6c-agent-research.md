# Canvas V2 Phase 6C — agent-grounded objectives (superseded by 6E)

Phase 6E removes the private screenshot injection described below. This file
is retained as a historical record of the 6C experiment, not the current V2
contract. The current agent must request exact research explicitly and watch
the complete flow render on the artboard before it continues designing.

Phase 6C completes the Phase 6 research reconnection. A design objective now
receives a small tenant-scoped research context automatically. The context is
derived deterministically from the instruction, capped at four flows and
sixteen ordered screens, and never leaves the authenticated account boundary.

Up to twelve exact screenshot files are loaded as bounded multimodal parts in
the same model request as the current rendered artboard. The model therefore
sees the evidence pixels; it is not expected to infer visuals from URLs.

The model remains the sole designer and source author. Research does not add a
planner, repair engine, scoring loop, or hidden canvas mutation. Any returned
image must use an approved exact URL and evidence ID. Only evidence identities
actually present in accepted HTML enter the candidate manifest, preventing
unused research results from appearing as missing evidence during observation.

Canonical flow guidance matches the manual Phase 6B composer: app identity at
left, full uncropped screens in exact order, and a clean horizontal lane.
Analytical copies may be transformed, but they must not impersonate or replace
the canonical flow.
