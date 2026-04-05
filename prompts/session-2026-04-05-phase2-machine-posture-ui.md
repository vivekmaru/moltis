# Session Summary: Phase 2 Machine Posture UI

Date: 2026-04-05

## Scope

Implemented the next operator-facing Phase 2 slice for the trusted operator
direction: make machine trust, health, and routing posture visible in the
workspace overview instead of leaving those details hidden behind the machine
selector.

## Implemented

### Workspace overview

- Expanded the workspace overview panel to fetch machine inventory alongside the
  workspace overview payload.
- Added a dedicated "Machine Posture" section for the active route, showing:
  trust state, health, approval mode, route type, platform, remote IP, host
  pinning, capabilities, commands, and route guardrails.
- Added an "Available Machines" inventory section that shows the current and
  preferred machine markers, trust state, health, stale telemetry, capabilities,
  and command summaries for each machine.
- Wired the view to refresh from relevant live events so posture data stays
  current as machine telemetry changes.

### Documentation

- Updated `docs/src/usage-guide.md` to describe the workspace overview as the
  primary operator surface for route visibility, health, trust, and guardrails.
- Updated `docs/src/architecture.md` to describe the richer machine posture view
  as part of the Phase 2 machine model.

### Web UI E2E coverage

- Extended the workspace overview Playwright spec to mock both
  `sessions.workspace_overview` and `machines.list`.
- Added assertions that verify the chat modal shows the active route, workspace
  preferred machine, machine posture section, trust labels, available machine
  inventory, and stale telemetry markers.

## Validation

Passed:

- `biome check --write crates/web/src/assets/js/components/workspace-overview.js crates/web/ui/e2e/specs/workspace-overview.spec.js`
- `cargo check -p moltis-web`
- `cd crates/web/ui && npx playwright test e2e/specs/workspace-overview.spec.js`

## Tracker

- `moltis-toc` was implemented in this session and should be closed once the
  commit is created and pushed.
