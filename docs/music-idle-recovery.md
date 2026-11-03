# Idle audio reconnection and bounded reads

Production logs for 3 November 2026 at 06:29:44, 06:31:24 and 06:34:00 UTC show a read timeout, upstream HTTP 502, then another timeout. These are audio-service lookup failures, not evidence of missing Discord channel permissions. An upstream 502 can remain a provider-side outage; this change does not guarantee provider availability.

Previously a manager's first resolved ready promise was cached indefinitely. Later lookups could reuse that promise after the node disconnected. Failed initialization removed the cache but did not retire its socket/connector. REST calls used Shoukaku's 60-second default and invalid/stalled bodies could appear empty.

The manager cache now rechecks node availability, shares concurrent initialization, retires only idle stale managers, cleans its own gateway listeners, bounds ready waits and applies a short cooldown after failed initialization. Active players/connections on any guild prevent an automatic reset. An old callback cannot remove a replacement entry. Explicit service/bot stop remains a forced shutdown path.

Read-only track lookup may recover once after 404/502/503/504 or timeout using a fresh idle manager. It never retries 429, authentication failures, voice joins, play commands, sends or other writes. Each REST attempt has a 12-second signal covering headers and body; the ready budget is 15 seconds. The whole lookup can span initialization and two attempts; this is not a 12-second total interaction SLA. A stale manager is not shared across bot clients.

Connector disposal detaches only owned raw/clientReady listeners and retires old sockets without Shoukaku's close-triggered reconnect path. Late node readiness closes the retired transport. No production customer was deliberately disconnected to test this behavior.

Tests cover working -> idle/disconnected -> fresh manager, concurrency, another bot, active-guild protection, bounded retry/cooldown, stale invalidation, listener cleanup, status preservation and stalled response body timeout. Live playback after an idle interval remains a separate acceptance check after deployment.
