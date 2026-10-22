# Step 7 — Services and subscriptions

## Product contract

All four existing plans retain their prices and existing capacity. No provider is enabled or changed. Every plan can use the available tool families; capacity is the distinction, not artificial labels claiming that an unavailable engine is included.

| Plan | Servers | Private bot links | Custom templates | Monthly change units | Active schedules | Team seats / server | Analytics | Audit history |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Free | 1 | 1 | 2 | 10 | 1 | 1 | 7 days | 20 days |
| Starter | 1 | 2 | 20 | 300 | 20 | 1 | 30 days | 90 days |
| Growth | 3 | 5 | 100 | 3000 | 200 | 5 | 90 days | 365 days |
| Business | 10 | 10 | 500 | 15000 | 1000 | 20 | 365 days | 365 days |

The private-bot metric counts registration rows (guild + bot), not unique application IDs, saved designs, or reserved computing instances. Team seats include the owner and are per server. Other capacity is shared across the account. Schedule capacity means active scheduled/sending messages, not sends per month. Change units mean executed changes as recorded by the existing operation accounting; a plan can contain multiple units. The UTC calendar month is the current accounting window. Data windows mean available collected data, not a guarantee that past data exists before enabling collection.

The shared service catalog covers structure/permissions, templates/imports, interactive panels, bounded JavaScript commands/projects, schedules, analytics/history, music, and conditional AI availability. AI's independent runtime is untouched. Image analysis requires a connected vision-capable engine; playback requires an accessible source and voice permissions. Existing per-command runtime limits still apply (10 code commands per bot/server, 50 versions, 128000-byte projects, up to 20 files). These are operational limits, not unlimited resources sold with a plan.

## Corrections

- Web write/capacity checks now retrieve the subscription end date. Active/trial access expires at the exact boundary; malformed dates fail closed. Existing indefinite grants remain valid.
- Queued messages, scheduled code, live code, and registered-bot interactions check the current owner account/subscription before new execution. Public built-in commands without a customer registration remain independent; account/support linking controls remain available.
- Cancellation requires explicit confirmation and an account row lock. A dated active subscription remains usable until its period ends; an indefinite subscription stops immediately after confirmation. Repeated cancellation is idempotent. Cancellation never deletes templates, commands, or Discord resources.
- Pending change requests can be cancelled by their own account, including in read-only mode. Manual admin activation marks a matching plan/interval request approved within the transaction and requests customer-role synchronization.
- Expired plans and different subscription intervals can be requested again. Requests do not directly grant entitlements.
- Admin request details no longer look up a support report with the same numeric ID.
- Removed unsupported support-priority promises and corrected Free audit history from “20 operations” to “20 days”. Removed provider-option placeholders from the customer request screen.
- Account services, capacities and lifecycle copy support Arabic/English. Preview/test fixtures now use the real catalog rather than outdated bot quotas.

## Boundaries and verification

No schema migration, price increase, deletion of production data, new infrastructure, independent AI model changes, or automatic external billing activation is part of this release. Cancellation controls new work; it does not undo already completed Discord changes or retract messages. In-flight external operations and already playing audio are not instantaneously rolled back. Private-bot synchronization stops an expired owner connection on its next existing 10-second sync tick, including its local music and runtime loops; reconnect checks cannot start it again until access returns. Public built-in passive handlers are not globally disabled because they are shared services; an already-started external action is not rolled back.

Existing deletion/privacy requests remain a verified-owner support process through the support page/official server; no automated irreversible account purge is advertised. Support email delivery remains subject to the owner's previously deferred mailbox renewal. Do not characterize those as newly verified automated services.

Tests cover exact time boundaries, invalid periods, indefinite grants, grace, suspended/missing owners, guild/bot owner scoping, same-account cancellation isolation, idempotency, data preservation, language coverage and request review. Full audit and Linux/PostgreSQL CI plus deployment status must be recorded separately; local health is not live Discord acceptance.
