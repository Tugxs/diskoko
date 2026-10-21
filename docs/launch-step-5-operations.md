# Step 5 — operations, alerts and release gates

## Separation of readiness and operational health

- `/api/health` is Render's web readiness probe: a short DB query and a minimal public bot status. A disconnected Discord worker alone does not restart an otherwise working website.
- `/api/operations/health` is a bounded, cached, public boolean for an independent observer. It does not expose queue payloads, customer identifiers, incident details or credentials. A missing/stale observation fails closed after 60 seconds.
- `/api/admin/operations` requires the existing fresh site-admin authentication. It shows worker heartbeat, gateway state, pending/running ages, scheduler/project delays, DB size/pool wait, memory, confirmed incidents, delivery results and deployed SHA. `POST .../test` also requires CSRF, is audited and limited to one accepted test per minute.

## Observation and delivery

The web observer runs every 20 seconds without overlap. Worker heartbeat runs every 10 seconds, independently from connected-bot reconciliation. Failure thresholds: worker heartbeat 90s; Discord pending age 45s or 200 pending; running age 90s; scheduled/project backlog 180s; sending/running scheduler work 600s; 10 recent Discord errors; repeated customer-role failures older than 15 minutes; 3 loop failures or stalled progress; RSS above 440 MiB; 8 waiting DB connections; 90% of the configured application DB soft limit; at least 10 HTTP 5xx and >10% errors in the current minute. The storage threshold is the application's configured budget, not a claim about Render's purchased disk capacity.

Aggregate automation checks also cover overdue control-center jobs (180s), giveaway announcements/retries (300s), and module reminder sends (180s). Private-bot connection counts are aggregated without names/tokens; a systemic alert requires at least three stale connections and at least half the registry, with a five-minute initial connection grace period. A single customer's misconfigured bot does not make the whole site unhealthy.

An additional failing observation 20 seconds later confirms an incident. Recovery also requires confirmation. Ongoing incidents remind at most every 30 minutes. Queue/DB error details and customer messages are never sent to the operations channel.

The existing `bot_runtime_state` KV table stores a bounded journal (`ops:journal:v1`): 50 history events, 50 pending notifications and a fixed set of incident keys. No migration, new runtime privilege or customer-data copy is necessary. A transaction advisory lock coordinates observers; per-destination delivery leases prevent overlapping generations from routinely sending the same alert. SMTP has a stable Message-ID, Discord bot messages have an enforced nonce. Delivery is **at least once**: an external provider may accept a message before the result is durably recorded, particularly for webhooks/SMTP. A DB outage uses bounded in-memory fallback until persistence returns; the independent observer handles loss of the web process as well.

Destinations are explicit configuration, never inferred from customer accounts:

- `OPS_ALERT_EMAILS`: up to three owner-approved recipients; existing SMTP settings provide the sender.
- `OPS_ALERT_GUILD_ID`, `OPS_ALERT_CHANNEL_ID`: exact operations destination. Bot delivery verifies the guild before sending and disables mentions.
- External observer: `OPS_DISCORD_WEBHOOK_URL` is a channel-scoped credential instead of the full customer/public bot token. Its guild and channel must match. Store it only in GitHub Actions secrets. Do not put it in source, logs, documentation or browser screenshots.

SMTP configuration presence does not prove authentication or inbox delivery. The admin history records transport acceptance/failure; real inbox/channel confirmation is separate evidence.

## Independent observer

The independent public [diskoko-status-monitor repository](https://github.com/Tugxs/diskoko-status-monitor) runs separately from Render every five minutes and on manual request. It contains only public aggregate probing and notification code, with no private application source or customer data. Enable its `monitor.yml` workflow with repository variable `OPS_MONITOR_ENABLED=true` only after destination secrets are configured. It probes readiness and operational health with bounded timeouts and confirms failed probes. It saves notification state as an artifact for seven days and retries only failed destinations; active incidents remind every 30 minutes. The private application repository has no periodic monitor workflow, avoiding duplicate alerts and private Actions minute consumption. It retains only the failed-main-Audit notification step.

GitHub schedules are best effort and can be delayed; this is not a five-minute availability SLA. Public repository schedules can be disabled for inactivity; check workflow status during monthly operations review. Standard public GitHub-hosted runners are free under current published pricing; do not select paid/larger runners. Render's own failure notifications provide another independent signal. For stronger launch requirements, replace/add a dedicated uptime service with an agreed check interval and escalation policy. Do not claim the GitHub scheduler is real-time monitoring.

An observed production outage does not deliberately fail the watchdog's code check, because Render's `checksPass` mode could otherwise block the corrective release. The explicit notifications and saved state carry the incident. Workflow/setup errors remain visible as failed Actions runs. The application Audit workflow remains the required code/test gate.

## Safe deployment and shutdown

- Web and worker use `npm ci`, `autoDeployTrigger: checksPass`, and a 90-second shutdown window. Render must actually show these values; a local YAML edit is not deployment evidence.
- Audit runs on every main push and PR, without path filters or skip conditions. It has read-only repository permissions, a 20-minute deadline, PostgreSQL 18, the full audit and high-severity production dependency scan. Cancelled/failed checks must not be treated as success.
- Blueprint Auto Sync is disabled: infrastructure changes are manually reviewed/applied after the relevant CI result, so a Blueprint configuration update cannot unintentionally bypass the release sequence. Service code auto-deploy stays `checksPass`.
- SIGTERM stops queue polling first, awaits a committed claim and its in-flight work, then closes bot clients/pools. Running Discord jobs whose outcome is uncertain are never automatically replayed. Hard exit after 85 seconds stays below Render's 90-second limit.
- The retiring worker marks/deletes its heartbeat only if the runtime generation ID still matches; it cannot remove the replacement's heartbeat.
- Web shutdown rejects new work, closes listeners, awaits HTTP/managed runner work, releases LISTEN, stops bot connections and closes the DB pool. Forced termination remains possible at the deadline and must be investigated, not described as a successful drain.
- The independent AI project is not modified or deployed by this step.

## Release / incident checklist

1. Run the full local audit; inspect skips. CI must run Linux + disposable PostgreSQL tests with no missing prerequisites. Check dependency advisories and Blueprint schema.
2. Confirm the PR SHA's successful `verify` job; then merge under the owner's deployment authorization. Confirm the merge SHA passes CI before Render starts its builds.
3. Verify web AND worker deploys are live on the intended SHA, readiness and operations health, queue age and error logs. A build accepted by Render is not a live deployment.
4. Send a labelled test to the selected operations channel and email; inspect the actual channel/inbox and stored per-destination state. Test incident and recovery logic in an isolated DB/process, not by stopping customers' live service.
5. Confirm the independent workflow actually ran and retained its state, rather than merely checking in a workflow file. Check Render's native notification settings too.
6. On an incident: examine the admin snapshot, Render deployment/metrics/logs and dependency status. Resolve permissions/configuration before retrying customer work. If a Discord write may have happened, inspect its result instead of replaying it.
7. Roll back to the previous known-good SHA only when schema/data compatibility is confirmed. Manual deploys can bypass the CI gate and specific-commit deploys may disable auto-deploy; emergency operators must inspect CI and restore `checksPass` afterwards. Do not store deploy hooks in CI unless there is a separate reviewed need.

## Known platform boundary

The current private repository's GitHub ruleset screen states that enforcement needs an eligible paid organization plan. Do not create a decorative, unenforced ruleset and call main protected. Render's tested `checksPass` gate still blocks automatic deployment on failed/missing checks. GitHub branch protection and an always-on staging environment are distinct controls; no paid plan or extra Render service is purchased implicitly.

Sources verified 2026-10-21: [Render deploys](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [Blueprint specification](https://render.com/docs/blueprint-spec), [notifications](https://render.com/docs/notifications), [background workers](https://render.com/docs/background-workers).
