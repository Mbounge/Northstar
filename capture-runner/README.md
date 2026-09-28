# Northstar capture host

This is the real host-side control service for Admin → Capture studio. It is
separate from the existing Render discovery worker. The Next.js admin API checks
the signed-in Supabase user's admin role, then proxies commands and evidence to
this service. The browser never receives the runner token or model API key.

## Host requirements

- A persistent Linux host with `/dev/kvm`, enough CPU/RAM/disk for the desired
  number of Android emulators, and an Android SDK with `adb` on the host.
- A Play-capable Android image with Google Play signed in on each assigned
  emulator. Northstar opens the exact package listing and requests installation
  if the target app is missing. Sign-in stays on the device; the runner never
  handles the Google password.
- The MobileSpy script and its Python dependencies installed on the host.
- A persistent data volume for `CAPTURE_DATA_ROOT`.
- HTTPS reachability from the Northstar Next.js server to this service through
  a reverse proxy or private network. Do not expose ADB or port 8787 directly.

Android's Linux emulator uses KVM. A dedicated bare-metal host is appropriate;
a generic cloud VM without nested virtualization is not a safe assumption.
Graet's package ID in the existing capture evidence is `com.graet`. A Pixel
label and Android 15 are not proof of compatibility: the native Play Store on
the capture host must install that package. If Play reports incompatibility,
the run stops as **Needs review** with the device model, API level, and ABI
available in Admin. Choose a different *verified* host device before resuming.

## Configuration

Set these in a root-owned `/etc/northstar/capture.env` or equivalent host secret
store. Never put live values in Git, a browser, or Codex app configuration.

```text
NORTHSTAR_CAPTURE_RUNNER_TOKEN=<generate a long random secret>
CAPTURE_DATA_ROOT=/var/lib/northstar/captures
CAPTURE_DEVICES_JSON={"device-1":"emulator-5554"}
CAPTURE_ADB=/opt/android-sdk/platform-tools/adb
MOBILESPY_SCRIPT=/opt/northstar/spy/spy_mobile2.5.py
MOBILESPY_PYTHON=/opt/northstar/venv/bin/python3
CAPTURE_BIND=127.0.0.1
CAPTURE_PORT=8787
CAPTURE_MAX_PASSES=12
OPENAI_API_KEY=<server-side model key>
```

Install the provided systemd unit after setting `User`, paths, and permissions.
Keep `/var/lib/northstar/captures` on persistent storage. The host service
performs a graceful interrupt for Pause, allowing MobileSpy to checkpoint;
Resume relaunches the same session directory.

Set these only on the Northstar Next.js server:

```text
NORTHSTAR_CAPTURE_RUNNER_URL=https://<capture-host-domain>
NORTHSTAR_CAPTURE_RUNNER_TOKEN=<same host token>
```

The Admin Capture studio lists real runs and devices. Queue a browsing run for
an organization and device, with Graet entered as app `Graet` / package
`com.graet`. Starting it first checks the device and Play Store; the supervisor
installs the app from Play when necessary, then starts MobileSpy. It retries
resumable capture passes only while evidence or coverage improves. An
incompatible listing, missing Play sign-in, repeated crash, or stalled coverage
becomes **Needs review**, with a concrete reason. Pause sends a graceful
interrupt to the supervisor, which forwards it to MobileSpy and waits for its
checkpoint. Resume reuses the same session directory. A run becomes Complete
only after both the capture summary and audit report completion with no
remaining coverage debt. Live device frames, logs, and saved screenshots are
available in Admin.

Keep one assigned emulator per active run. The runner's device pool must contain
only dedicated capture devices, not a serial currently used by a separate
MobileSpy process. The host service survives its own restart while the capture
supervisors continue; the registry and per-run checkpoints live on persistent
storage. Onboarding and publication to a tenant's app catalog are separate
operations and are not implied by a browsing run's completion.

Before declaring the system operational, provision the host, sign the Play
account into its emulator, configure the two server-side runner variables,
and confirm Graet's native install. No cloud host or account is provisioned by
this repository alone.

## Current Graet device result

The first dedicated host is provisioned with an Android 15 Google Play x86_64
emulator, and the Play account is signed in. Its native `com.graet` listing says
“Your device isn't compatible with this version.” The installer reports this
as an incompatible, review-needed run instead of retrying or substituting a
different app. The exact incompatibility reason is not known from the listing;
Graet needs a device on which native Play installation succeeds before a
capture can begin. This result does not prevent other compatible apps from
using the capture host.

## Local smoke test without a capture

Use a temporary data root and a throwaway token, then call `/health`,
`/v1/devices`, and `/v1/runs`. The included `test_server.py` exercises auth,
durable run creation, and invalid input without launching MobileSpy.
