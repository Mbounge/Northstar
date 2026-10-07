# Simulator preview access

Northstar presents interactive app simulators in each assigned app's existing Product Preview tab. The live-device app-preview service and its client, broker, grant, provisioning, and emulator code have been removed from this repository. Capture agents and their devices remain as inputs for building and verifying simulators.

`lib/preview/simulator-registry.ts` maps an app name to its local simulator. The Product Preview tab embeds a released simulator directly and shows a pending state for other apps. The GRAET simulator route requires an approved signed-in user and checks that user's tenant has GRAET assigned in `target_apps` before rendering.

When releasing another simulator, add it to the registry, give its direct route the same assignment check, and complete the [app simulator preview standard](app-simulator-preview-standard.md). Do not restore a live-device fallback or a separate catalog for pending apps.

The old `preview_app_entitlements` migration remains in database history. Its table is unused and cannot grant simulator access; remove the table only through a later controlled database migration.
