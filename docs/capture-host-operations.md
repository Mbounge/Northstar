# Android capture host operations

The Android capture runner is on the Hetzner host `49.12.126.233`. From the owner's Mac, the existing local SSH identity works without a password prompt:

```sh
ssh -i ~/.ssh/id_rsa root@49.12.126.233
```

The first connection in a new SSH environment may ask to trust the host key. The private key stays on the Mac; it is not stored in this repository. A Codex session on another machine needs its own authorized SSH identity and host trust setup.

On the host:

- Runner code: `/opt/northstar/capture-runner`
- Onboarding and browsing agent scripts: `/opt/northstar/spy`
- Central run data: `/var/lib/northstar/captures`
- Runner configuration and token: `/etc/northstar/capture.env` (do not print or copy this file into logs)
- Control service: `northstar-capture.service`
- Writable temporary files: `/var/lib/northstar/tmp` (`TMPDIR` for the sandboxed runner and agents; `/tmp` is read-only under `ProtectSystem=strict`)
- Active Android emulator services: `northstar-emulator.service`, `northstar-emulator-2.service`, and `northstar-emulator-3.service`
- Disabled spare: `northstar-emulator-4.service`

The three active emulator units use `-gpu lavapipe -feature -Vulkan -no-snapshot-load`.
Their service definitions are tracked in `capture-runner/`. The previous
`swiftshader_indirect` setting caused repeated emulator process crashes during
Wikipedia feed scrolling. After the primary device passed that scroll twice
without a restart, devices 2 and 3 were switched one at a time and verified to
boot, reconnect through ADB, capture screenshots, and retain Play Store. Keep
checking process restarts during full parallel capture runs; basic device
checks do not establish sustained multi-agent stability.

Read-only checks:

```sh
systemctl status northstar-capture northstar-emulator northstar-emulator-2 northstar-emulator-3 --no-pager
sudo -u northstar /opt/android-sdk/platform-tools/adb devices -l
```

The production Admin capture page proxies authenticated requests to the host. Android onboarding and browsing are separate queued run types. For a **new Android** capture, Admin starts Google Play listing/icon collection from the supplied package while the run is queued. Capture Start waits until the exact package's public listing and icon are verified. The icon appears in Capture Studio before browsing begins. Legacy runs, including Wikipedia, can select a separate Apple listing later in Pipeline. Start onboarding on an online device, review its screenshots and completion state, then queue browsing on that same signed-in device. A successful capture remains in the central run pool. For a finished Android browsing run, **Pipeline** prepares a reviewable canonical map, then can run resumable screen preprocessing and flow generation.

Pipeline preparation verifies that every canonical screenshot exists, is a readable PNG, stays inside that run's screenshot directory, and appears in the saved flow taxonomy. It writes derived files under `flows/` and records hashes of both the source manifest and canonical screenshot bytes in `processing_pipeline.json`; it never edits the source manifest or screenshots. A changed source is rejected before previously processed AI checkpoints can be reused, and screenshot integrity is checked again before review. `processing_pipeline.log` is available in the Admin Pipeline view. The map is not a completed coverage audit: a partial capture audit remains partial. Processing uses the host's configured OpenAI key and can take substantial time for large apps; the Admin action starts it explicitly. If a processing worker is killed or the host restarts, the capture service resumes its saved checkpoints up to three times; a substantive processing failure stays visible for review. A completed processing stage is **ready for review**, not published.

The capture detail subtabs (Overview, Pipeline, Screens, Activity, Setup) keep the tab bar in place when switching between long and short views. Screens loads a bounded 24-image page with a same-size loading state; all saved screenshots remain available through page controls. Include this scroll and loading behavior in Admin UX regression checks, especially for runs with hundreds of images.

After processing, Pipeline transfers the selected listing, canonical screenshots, enriched analysis and generated flows to an explicitly selected tenant. The transfer records a resumable checkpoint in storage; each file is checked against its captured SHA-256 before upload, and final registration waits for every expected file. A partial capture audit requires an explicit acknowledgement and remains partial in the stored release provenance. The app icon, catalog record and browsing session are registered only after transfer validation. Existing tenant browsing evidence is protected from replacement by this first-release path. The central capture stays on the host and can be delivered to another tenant without recapturing the app.

Remaining release work: complete Wikipedia's live AI processing and verify the tenant app page, chat evidence and canvas against its generated lanes; add immutable versioned releases and explicit access grants in the shared app library; add a reviewed no-listing path for apps without a public store page. A selected Apple listing is **iOS marketing evidence**, not proof that its UI matches the Android capture. Do not call an app fully published until the tenant-facing evidence has been checked.

An unexpected capture-service restart now resumes interrupted Android runs from their existing run directory after the assigned emulator is healthy. The runner waits up to three minutes and permits two automatic recovery attempts; it leaves a run in Needs review if recovery cannot succeed. An intentional Pause stays paused. The same saved screenshots and app data are used on resume, and the supervisor also retries transient emulator disconnects during an active pass. These mechanisms do not certify coverage: inspect the capture map and final audit before flow generation.

Capture studio's Activity view shows recent log lines and offers a full, redacted log download for offline diagnosis. Its device view replaces each frame only after the next screenshot has loaded; it is a periodically refreshed view, not a video stream. A new onboarding run clears the target app's data, while Resume keeps the same run directory, screenshots, and app state.
For browsing runs, Overview derives a live capture map from the saved manifest and agent memory. Main navigation names and subviews come from the app being explored; the percentage is only the share of identified main areas reached, not a completion score. Profile and Settings are discovery checkpoints and remain "Not identified yet" until the agent finds them. "Finish run" requests a final checkpoint, then ends a stuck agent after two minutes. Saved evidence remains available, and any incomplete audit stays partial rather than being reported as complete.
Each tab's review section lists the known open checks from the current capture checkpoints, including the recorded reason and affected path. "Main-section impact" means a root tab or direct section is affected; "One-page impact" means a nested page is affected; "Impact not yet known" means the checkpoint is incomplete without a specific cause. These are navigation-scope labels, not a severity judgment about product importance. A live audit file may lag the agent by hours, so the Admin map does not present that stale audit's obligation count as current coverage.
The browsing agent now makes a bounded repair pass before leaving each root tab and records a `root_exit_checkpoints` result. A tab with an unresolved survey, child capture, or route stays `review_needed`; an infinite feed or blocked route does not prevent other main tabs from getting their first pass. Resume prioritizes the saved debt, and a later capture-limit repair gets a larger bounded scroll allowance. An informational first-use screen with a verified native Continue action can be advanced; account, consent, permission, and payment gates remain deferred. Overlay actions require semantic destination verification, so an unrelated page is retained as a diagnostic rather than a canonical flow lane.
On resume and before each root exit, the agent audits canonical screenshot references. A known wrong-route image, missing file, invalid PNG header, or reference outside the run's screenshot directory is removed from its canonical lane and recorded as diagnostic evidence; the original file is never deleted. The affected root is queued for recapture, and unresolved menu misroutes prevent the root from being certified. The final stabilization summary names roots still needing review, and the supervisor cannot mark a run complete while any remain. This deterministic audit cannot infer that an otherwise valid screenshot depicts the wrong app page; the before/after destination check is what catches that class of error during new actions. An uncertain route remains visible for review rather than being silently relabeled.
For a paused run with a demonstrated canonical-label error, use `capture-runner/reconcile_paused_capture.py --session <run-directory> --plan <reviewed-plan.json>` for a read-only preview, then add `--apply`. It validates lane PNGs, backs up both manifest and agent memory, preserves every image, and records excluded/misrouted evidence. Reconciliation never converts an uncertain screenshot into verified coverage; resume must recapture that scope.
Admin distinguishes a settled guest path from an account-creating onboarding run using the manifest's account-created flag and validation score. A guest path can complete its first-run experience without producing a signed-in account; subsequent browsing remains guest browsing.

The host has 4 physical CPU cores / 8 hardware threads and 31 GiB RAM. Three independent Play-enabled emulators are currently online as `android-1`, `android-2`, and `android-3`, with two virtual CPU cores each. They share the owner's Google Play account state but have separate writable emulator disks and ADB serials. The runner allows only one live capture per device, so different devices can run different apps concurrently. Three-device Play listing, screenshot, and UI-read checks passed. A fourth emulator also passed those lightweight checks after tuning, but is disabled to leave headroom for actual capture agents. Three simultaneous full agent runs have **not** yet been validated end to end; watch the first parallel runs before raising the operating limit.
