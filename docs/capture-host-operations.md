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
- Android emulator service: `northstar-emulator.service`

Read-only checks:

```sh
systemctl status northstar-capture northstar-emulator --no-pager
sudo -u northstar /opt/android-sdk/platform-tools/adb devices -l
```

The production Admin capture page proxies authenticated requests to the host. Android onboarding and browsing are separate queued run types. Start onboarding first on the online device, review its screenshots and completion state, then queue browsing on the same signed-in device. A successful capture remains in the central run pool; preprocessing, flow generation, and tenant publication are separate steps. The host currently has one Android device, so runs must use it sequentially.
