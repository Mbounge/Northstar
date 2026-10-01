# Social capture runner

Northstar Admin’s Marketing studio configures official LinkedIn, X, and Instagram URLs for an app. This separate host service owns the private browser state, runs the adapted `social_researcher.py` and `social_monitor.py`, records per-source evidence coverage and logs, and schedules a single social capture at a time. Existing Android capture devices and their processes are independent.

The runner does not hold a Supabase service role key. For each completed capture, it asks `/api/internal/marketing-publish` for signed upload URLs, uploads the validated screenshot-backed feed, then asks Northstar to register the snapshot. If capture or validation fails, no `app_snapshots` row is created. The marketing-only snapshot is read by the Marketing tab and canvas; other pillars resolve their most recent evidence at or before the selected snapshot.

Required host environment in `/etc/northstar/marketing.env`:

```
NORTHSTAR_MARKETING_RUNNER_TOKEN=<random secret>
NORTHSTAR_MARKETING_PUBLISH_TOKEN=<another random secret>
NORTHSTAR_MARKETING_PUBLISH_URL=https://www.usenorthstar.ai/api/internal/marketing-publish
NORTHSTAR_MARKETING_DATA_ROOT=/var/lib/northstar/marketing
NORTHSTAR_MARKETING_BIND=127.0.0.1
NORTHSTAR_MARKETING_PORT=8790
```

Optional: `NORTHSTAR_MARKETING_GEMINI_KEYS` for post tagging and people selection. Without it the capture runs with explicit unclassified tags. Configure only a dedicated collector browser session on the host; never copy a Northstar user’s account credentials into the runner.

The original local scripts work with authenticated browser state: LinkedIn attaches to a live Chrome CDP context, while X/Instagram use a persistent visible Chrome profile. The Hetzner runner uses one server-side profile for all three via `NORTHSTAR_MARKETING_BROWSER_MODE=shared_cdp` in `/etc/northstar/marketing.env`. The enabled `northstar-marketing-display`, `northstar-marketing-desktop`, and `northstar-marketing-browser` units provide a virtual desktop, window manager, and persistent standard Google Chrome Stable profile at `/var/lib/northstar/marketing/linkedin-browser`; CDP is bound to loopback port 9222. `NORTHSTAR_MARKETING_CHROME_BINARY` selects standard Chrome; omitting it uses Playwright's bundled browser. Browser connectivity alone does not prove a signed-in source. A zero-person LinkedIn research run is marked `needs_review`, and a snapshot missing screenshot-backed posts from any configured source is not published. Do not copy Mac browser cookies or Northstar user credentials to the host. Direct unauthenticated requests from this Hetzner IP have returned LinkedIn HTTP 999, so test through the signed-in browser and check evidence on every run.

Production now routes Caddy `/marketing/*` to the cloud runner on `127.0.0.1:8790`; the Android route remains on `8787`. On 2026-10-01, the signed-in cloud profile completed Whop research with 15 people and snapshot run `4dd6394d-dfa0-48a3-a19f-cd5b0a56793f`, publishing `20261001T154946046Z_social_4dd6394d` with 9 LinkedIn, 2 X, and 2 Instagram posts. The prior Mac collector and reverse tunnel LaunchAgents were uninstalled; public runner status still reported `worker_location: cloud` afterward. Platform sessions can expire, so monitor per-source coverage and reauthenticate when needed.

For future cloud sign-in, expose the Xvfb display through a short-lived VNC/noVNC pair bound **only** to host loopback, then use an SSH local forward to view it at `http://127.0.0.1:6081/vnc.html` on the administrator's computer. The login session runs in the Hetzner browser; only the temporary viewing tunnel uses the administrator's computer. Stop the viewer services and local forward after sign-in. Do not expose VNC, noVNC, or CDP on a public network interface. Do not ask for passwords or verification codes in chat.

### Mac collector fallback (inactive)

The user's everyday Chrome profiles must **not** be attached as unattended collectors. An earlier attach exposed multiple profiles and over 200 browser targets, disrupting normal browsing. The dedicated `~/chrome_profile` is the only permitted Mac fallback. Its collector and tunnel are currently uninstalled because production runs on Hetzner.

The existing manual social scripts use `~/chrome_profile` with Chrome remote debugging on port 9222. Reuse **that** dedicated browser data directory for the Admin collector; it is separate from Chrome's everyday multi-profile data directory. The Mac collector allows only this exact directory. Before attaching, it checks that the process listening on port 9222 is Google Chrome with this profile's files open, then checks the browser debugging endpoint. Do not copy Chrome cookies or passwords from another profile. Confirm an actual research and screenshot-backed snapshot run before enabling schedules or the Admin route. The debugging port must remain on loopback and must not be tunneled to Hetzner.

To open the collector from a normal Mac Terminal, run `/opt/anaconda3/bin/python3 marketing-runner/open_collector_browser.py` from this worktree. It uses the same `~/chrome_profile` and port 9222 as the user's manual command, adds an explicit loopback bind, and opens LinkedIn, X, and Instagram tabs in that window. Sign into any site that needs it there. Keep this window open for the first local research and snapshot verification.

`mac_collector.py` runs the bearer-protected service on Mac loopback, loading the two existing tokens from the ignored `.env.development.local`. `NORTHSTAR_MARKETING_BROWSER_MODE=shared_cdp` makes all three social phases use that collector browser. No cookie file or password is copied. Capture data is stored in `do-x20/outputs/marketing-collector`. Run the service with `/opt/anaconda3/bin/python3 marketing-runner/mac_collector.py` after installing the Python requirements. `install_mac_worker.py install` configures the dedicated browser, collector, and tunnel using `~/chrome_profile`; the browser launcher reuses an existing collector process and refuses a conflicting port.

A reverse SSH tunnel can map Hetzner loopback `127.0.0.1:18790` to the Mac service's `127.0.0.1:8790` if a temporary fallback is required. Repoint Caddy only after verifying the fallback's signed-in browser and a complete snapshot. `install_mac_worker.py install` creates the dedicated browser, collector, and tunnel LaunchAgents; `uninstall` removes them. This fallback works only while the Mac is online and should not be used for unattended schedules.

Required web Production environment: `NORTHSTAR_MARKETING_RUNNER_URL` (`https://capture.49-12-126-233.sslip.io/marketing`), `NORTHSTAR_MARKETING_RUNNER_TOKEN` (same host token), and `NORTHSTAR_MARKETING_PUBLISH_TOKEN` (same host publish token). The web app already holds `SUPABASE_SERVICE_ROLE_KEY` for the internal publisher.

Install in a separate Python virtual environment with `pip install -r requirements.txt` and `PLAYWRIGHT_BROWSERS_PATH=/var/lib/northstar/marketing/browsers python -m playwright install chromium`. Run as the `northstar` user using the supplied systemd unit, with persistent `/var/lib/northstar/marketing` ownership. Route `/marketing/*` to `127.0.0.1:8790` through Caddy while retaining the existing Android capture route. The runner API is bearer-protected and the service only binds to loopback.

Check `GET /v1/status`, `GET /v1/targets`, and `GET /v1/runs` with the runner token; logs are available at `GET /v1/runs/{id}/logs`. Admin’s server proxy handles these calls for authenticated administrators. Schedule times are interpreted in each target’s chosen IANA timezone; one global worker serializes simultaneous jobs. A restarted active job is marked interrupted and can be rerun after inspection.
