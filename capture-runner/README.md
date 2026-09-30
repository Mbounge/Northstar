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

## iPhone capture through Northstar Admin

The iOS runner is a separate Mac-hosted service (`ios_server.py`) using
Appium's XCUITest driver (`ios_agent.py`). Admin is the control plane: select
**iPhone (iOS)**, the organization, the app's bundle ID and the real iPhone;
then create, start, pause or resume the run in Capture studio. The Admin page
shows preflight status, saved screenshots, a recent device frame and the
agent log. It does not expose Appium or the iPhone directly to the browser.

A *real, trusted iPhone* is required for a public App Store build. Install
Graet through the iPhone's App Store and sign in there. Xcode Simulator cannot
install the public App Store build. On the Mac host, install an Xcode version
compatible with its macOS and the phone's iOS, accept the Xcode license,
enable Developer Mode and UI Automation on the iPhone, and configure and start
Appium with its XCUITest driver and WebDriverAgent signing. See the
[Appium real-device setup](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/device-setup/)
and [XCUITest system requirements](https://appium.github.io/appium-xcuitest-driver/latest/getting-started/system-requirements/).

Set these on the Mac runner host, preferably in a protected service environment:

```text
NORTHSTAR_IOS_RUNNER_TOKEN=<long random secret, different from the Android token>
IOS_CAPTURE_DEVICES_JSON={"graet-iphone":{"udid":"<real iPhone UDID>","name":"Graet iPhone"}}
IOS_CAPTURE_DATA_ROOT=/var/lib/northstar/ios-captures
IOS_CAPTURE_BIND=127.0.0.1
IOS_CAPTURE_PORT=8788
IOS_APPIUM_URL=http://127.0.0.1:4723
IOS_XCODE_ORG_ID=<Apple Development team ID, if WebDriverAgent needs signing>
IOS_CAPTURE_MAX_ACTIONS=120
```

Run `ios_server.py` as a persistent service on the Mac. Publish only its
bearer-protected HTTP endpoint through a private, HTTPS connection reachable
by Northstar's server; keep Appium on localhost. Set the following on the
Northstar Next.js server, alongside the Android runner variables:

```text
NORTHSTAR_IOS_RUNNER_URL=https://<private-https-endpoint>
NORTHSTAR_IOS_RUNNER_TOKEN=<same Mac-runner token>
```

The iOS agent checkpoints after each screen and action, so resume uses the
same run directory and skips previously attempted controls. It avoids obvious
purchase, publish and account-changing actions and returns to the app after
an external screen. It deliberately reports **Needs review** when it reaches
a navigation or action limit; no current iOS run is marked Complete without
an evidence-backed coverage audit. This is a foundation for live-device
calibration and coverage planning, not a claim that Graet has already been
captured. No compatible real iPhone is connected in the current environment,
and the iOS path has not yet been validated against Graet on-device.
