# Shared app library and tenant placement

## Purpose

Capture an app once, keep its source evidence in a central library, and decide separately which organizations can use it. A captured app is **unpublished** until an administrator grants access. Capturing or reprocessing it must not silently alter any tenant's catalog.

## Current state (September 2026)

- Android onboarding and browsing runs can be queued without an organization. The capture host stores each run by run ID under `/var/lib/northstar/captures`.
- Published app records, indexed sessions, snapshots, and `reviews` objects are presently scoped to a tenant ID. The tenant UI and canvas read `target_apps` and `app_sessions` in that scope.
- The home page displays Direct, Indirect, and Top Apps labels, but they are not yet connected to assignments or filtering.

The host's run directory is a capture staging area, not yet a published shared catalog. A successful run is not sufficient evidence that processing, flow generation, indexing, and tenant delivery have succeeded.

## Target model

1. **App identity:** one catalog entry for a platform and package/bundle identifier. Preserve display names and icons as versioned metadata, not identity keys. Android and iOS variants may be linked as one product without merging their evidence.
2. **Evidence release:** an immutable, versioned set of onboarding, browsing, store, processed screens, flows, and manifests. Each item has a status so a partial capture cannot be published as complete. Keep original capture run IDs for provenance.
3. **Access grant:** an organization-to-app/release relationship. Revoking a grant removes access without deleting the source evidence or affecting other organizations.
4. **Placement:** independent of access. An organization's grant may appear under Direct or Indirect. Top Apps is a curated global placement, visible across organizations. An app can have more than one placement where product rules allow it.
5. **Delivery:** the tenant-facing catalog, chat evidence lookup, and canvas must resolve the same authorized release. An app appearing in a tab must open successfully and show its screens and flows; a tab label alone is not publication.

An admin workflow should be: select a completed evidence release in the shared library, review its coverage, choose one or more organizations and their Direct/Indirect placement, or publish it to the global Top Apps pool. Show delivery/indexing status for each destination. Reassigning an app should not recapture it.

## Access and rollout rules

- The shared capture pool is private to admins. Selecting an organization when queuing a capture records context; it does not grant access or publish evidence.
- Global Top Apps means available to all eligible tenants, including future tenants, under an explicit global publication state. It must not follow merely from leaving organization blank on a run.
- Tenant-specific Direct/Indirect grants must be checked for every app detail, flow, screenshot, search, and canvas retrieval route. A filtered home page by itself is not an access boundary.
- Do not delete or relocate existing tenant evidence during migration. Introduce a resolver for shared releases and existing tenant paths, then migrate tenant records incrementally after validating that chat and canvas resolve the same screens.
- Publication should be atomic from a user's perspective: only show an app after required evidence and indexes are ready. Expose queued, processing, ready, published, failed, and revoked states in Admin.

## Decisions still needed

- Precise business meaning and default assignment for Direct versus Indirect.
- Who curates and orders Top Apps, and whether individual tenants can hide global entries.
- Whether organizations receive the latest approved release automatically or stay pinned until an admin promotes an update.
- Whether a tenant can add private annotations or business/marketing snapshots to a globally shared app without exposing those additions to other tenants.

Until these rules are settled, build the central library and delivery state without assuming that capture, tenant access, and tab placement are the same action.
