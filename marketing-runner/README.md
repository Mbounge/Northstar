# Social capture runner

Northstar Admin’s Marketing studio configures official LinkedIn, X, and Instagram URLs for an app. This separate host service owns the private browser state, runs the adapted `social_researcher.py` and `social_monitor.py`, records per-source evidence coverage and logs, and schedules a single social capture at a time. Existing Android capture devices and their processes are independent.

The runner does not hold a Supabase service role key. For each completed capture, it asks `/api/internal/marketing-publish` for signed upload URLs, uploads the validated screenshot-backed feed, then asks Northstar to register the snapshot. If capture or validation fails, no `app_snapshots` row is created. The marketing-only snapshot is read by the Marketing tab and canvas; other pillars resolve their most recent evidence at or before the selected snapshot.

Required host environment in `/etc/northstar/marketing.env`:

```
NORTHSTAR_MARKETING_RUNNER_TOKEN=<random secret>
NORTHSTAR_MARKETING_PUBLISH_TOKEN=<another random secret>
NORTHSTAR_MARKETING_PUBLISH_URL=https://usenorthstar.ai/api/internal/marketing-publish
NORTHSTAR_MARKETING_DATA_ROOT=/var/lib/northstar/marketing
NORTHSTAR_MARKETING_BIND=127.0.0.1
NORTHSTAR_MARKETING_PORT=8790
```

Optional: `NORTHSTAR_MARKETING_GEMINI_KEYS` for post tagging and people selection. Without it the capture runs with explicit unclassified tags. Configure only a dedicated collector browser session on the host; never copy a Northstar user’s account credentials into the runner.

The original local scripts work with authenticated browser state: LinkedIn attaches to a live Chrome CDP context, while X/Instagram use a persistent visible Chrome profile. The server preserves that model. `northstar-marketing-display.service` provides a virtual desktop, `northstar-marketing-browser.service` keeps a dedicated LinkedIn Chrome profile at loopback CDP port 9222, and X/Instagram share one persistent collector profile across apps. Browser connectivity is not the same as platform sign-in. An administrator must authenticate dedicated collector accounts on the host before expecting LinkedIn people or social posts. A zero-person LinkedIn research run is marked `needs_review`; it is not reported as a successful discovery. Do not copy Mac browser cookies or Northstar user credentials to the host. A Hetzner smoke test reached LinkedIn with HTTP 999 and no employee links; the host capture path is not validated until platform access and a real end-to-end run succeed.

### Signed-in Mac collector

The user's working Chrome profile is `Profile 3` (Bo, `bondlovu0@gmail.com`) on this Mac. Its LinkedIn, X, and Instagram sessions are reported signed in. Keep its browser data on the Mac. Chrome 154's default data directory cannot be opened with a new `--remote-debugging-port` process; enable Chrome's explicit local Remote Debugging setting for that profile and approve its connection instead. This gives local automation access to the whole profile while enabled, so never expose its debugging port on a non-loopback interface or tunnel it to Hetzner.

`mac_collector.py` runs the same bearer-protected service on Mac loopback, loading the two existing tokens from the ignored `.env.development.local`. It sets `NORTHSTAR_MARKETING_CHROME_DATA_DIR` to Chrome's local data directory and resolves Chrome's rotating `DevToolsActivePort` at run time. `NORTHSTAR_MARKETING_BROWSER_MODE=shared_cdp` makes all three social phases use the signed-in Chrome session. No cookie file or password is copied. Its data directory is `../../outputs/marketing-collector` relative to the worktree. Run it with `/opt/anaconda3/bin/python3 marketing-runner/mac_collector.py` after installing the Python requirements.

A reverse SSH tunnel maps Hetzner loopback `127.0.0.1:18790` to the Mac service's `127.0.0.1:8790`, leaving the existing Android capture service unchanged. Only after a successful authenticated browser test, route Caddy `/marketing/*` to `18790` instead of the unverified server collector. Admin and Vercel retain their existing marketing URL and bearer token. `install_mac_worker.py install` creates two user LaunchAgents to restart the Mac service and SSH tunnel automatically; `uninstall` removes them. This capture path works only while this Mac and Chrome profile are available. The service queues missed scheduled work when it comes online again. A separate continuously online, authenticated collector is needed before treating daily schedules as guaranteed.

Required web Production environment: `NORTHSTAR_MARKETING_RUNNER_URL` (`https://capture.49-12-126-233.sslip.io/marketing`), `NORTHSTAR_MARKETING_RUNNER_TOKEN` (same host token), and `NORTHSTAR_MARKETING_PUBLISH_TOKEN` (same host publish token). The web app already holds `SUPABASE_SERVICE_ROLE_KEY` for the internal publisher.

Install in a separate Python virtual environment with `pip install -r requirements.txt` and `PLAYWRIGHT_BROWSERS_PATH=/var/lib/northstar/marketing/browsers python -m playwright install chromium`. Run as the `northstar` user using the supplied systemd unit, with persistent `/var/lib/northstar/marketing` ownership. Route `/marketing/*` to `127.0.0.1:8790` through Caddy while retaining the existing Android capture route. The runner API is bearer-protected and the service only binds to loopback.

Check `GET /v1/status`, `GET /v1/targets`, and `GET /v1/runs` with the runner token; logs are available at `GET /v1/runs/{id}/logs`. Admin’s server proxy handles these calls for authenticated administrators. Schedule times are interpreted in each target’s chosen IANA timezone; one global worker serializes simultaneous jobs. A restarted active job is marked interrupted and can be rerun after inspection.
