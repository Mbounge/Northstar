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

The production Admin capture page proxies authenticated requests to the host. Android onboarding and browsing are separate queued run types. Start onboarding first on an online device, review its screenshots and completion state, then queue browsing on that same signed-in device. A successful capture remains in the central run pool; preprocessing, flow generation, and tenant publication are separate steps.

Capture studio's Activity view shows recent log lines and offers a full, redacted log download for offline diagnosis. Its device view replaces each frame only after the next screenshot has loaded; it is a periodically refreshed view, not a video stream. A new onboarding run clears the target app's data, while Resume keeps the same run directory, screenshots, and app state.
For browsing runs, Overview derives a live capture map from the saved manifest and agent memory. Main navigation names and subviews come from the app being explored; the percentage is only the share of identified main areas reached, not a completion score. Profile and Settings are discovery checkpoints and remain "Not identified yet" until the agent finds them. "Finish run" requests a final checkpoint, then ends a stuck agent after two minutes. Saved evidence remains available, and any incomplete audit stays partial rather than being reported as complete.
Admin distinguishes a settled guest path from an account-creating onboarding run using the manifest's account-created flag and validation score. A guest path can complete its first-run experience without producing a signed-in account; subsequent browsing remains guest browsing.

The host has 4 physical CPU cores / 8 hardware threads and 31 GiB RAM. Three independent Play-enabled emulators are currently online as `android-1`, `android-2`, and `android-3`, with two virtual CPU cores each. They share the owner's Google Play account state but have separate writable emulator disks and ADB serials. The runner allows only one live capture per device, so different devices can run different apps concurrently. Three-device Play listing, screenshot, and UI-read checks passed. A fourth emulator also passed those lightweight checks after tuning, but is disabled to leave headroom for actual capture agents. Three simultaneous full agent runs have **not** yet been validated end to end; watch the first parallel runs before raising the operating limit.
