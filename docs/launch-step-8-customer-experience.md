# Step 8 — Customer experience

## Delivered scope

- Account and server onboarding guides follow real connection state; one server remains the context for every tool.
- Search the sidebar by Arabic or English tool names. Advanced administration is collapsed by default; unavailable game placeholders are separated from working panels.
- Mobile navigation has a backdrop, keyboard focus containment, Escape handling and inaccessible background while open. Forms, editor layout and dialog actions fit narrow screens.
- Dirty dialogs and code editors require explicit discard before leaving; code is not copied into browser storage by this feature.
- Async view results cannot replace a newer visit. Skip-to-content focuses the current tool instead of changing its route.
- Shared Gregorian dates, readable states and action labels, useful network/timeout guidance and request tracking where available.
- Quick start and usage instructions match the implemented review and activation flows.

## Scheduled messages

One main workspace replaces the duplicate advanced schedule list. It provides bounded server-side pagination, text/command search, status/channel filters, upcoming-first order, per-message time zone, delivery history and Discord links, cancellation, pause/resume, text editing and explicit copying to a new schedule. Command content remains edited in its own editor; it cannot silently be converted into plain text.

The composer includes a plain-text preview, 2,000-character counter, visible IANA time zone and the next three occurrences. Changes reset approval. Ambiguous or nonexistent daylight-saving times are rejected. Repeat previews match the existing sender contract: fixed daily/weekly intervals and a UTC monthly anchor with short-month clamping. No promise of local-wall-clock DST adjustment is made.

Writes preserve owner/guild scoping, current permissions, plan capacity, row locking and optimistic revision checks. Jobs already sending or finished cannot be edited/resumed. Failed jobs do not retry automatically: the customer checks the channel and history first. A pending submit is guarded in the browser; identical text schedule requests serialize in PostgreSQL and reuse the existing job before consuming quota. No schema migration or new infrastructure is required.

## Verification and limits

Local full audit: 723 tests, 717 passed, zero failed, six platform/database prerequisites skipped. Required Linux/PostgreSQL checks must pass in GitHub before deployment. Focused scheduling tests cover recurrence equivalence, invalid filters, owner/guild query boundaries, duplicate submission reuse, composer confirmation reset, safe preview rendering and sending-state controls.

Browser checks used read-only synthetic fixtures and authenticated read-only production views. At 375px the overview, alerts, channel/role editor, schedules, panels, commands, analytics, security, history, settings and representative panel dialogs fit without document overflow. The schedule dialog measured 355px with no controls outside the viewport. These checks do not certify real Discord publication; the joint real-server acceptance test remains separate.

Independent AI runtime/model development remains outside this release. Existing service capacities are preserved. Future rich embeds, schedule end dates and local-wall-clock recurrence need explicit storage/runtime work rather than nonfunctional UI switches.
