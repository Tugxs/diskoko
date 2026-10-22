# Step 9 — Capacity contract and repeatable load testing

## What the numbers mean

The production baseline in `capacity-production-current-2026-10-22.json` is telemetry under light observed traffic, not saturation testing. Local component results run on a Windows workstation. CI additionally runs Node in a 0.5-CPU/512-MiB Docker envelope and PostgreSQL in a separate 0.1-CPU/256-MiB envelope, matching current nominal allocations. Matching quotas does not reproduce Render hardware, networking or managed-database configuration. No customer database, Discord API, YouTube or real voice channel receives benchmark traffic. Synthetic API authentication bypasses OAuth/session loading; real schedule SQL, owner scoping and resource admission are included. This is a conservative launch envelope, not a certified subscriber maximum.

Reproduce with `node scripts/capacity-bench.mjs --output=capacity-results.json`. The HTTP component requires `RESOURCE_TEST_DATABASE_URL` pointing to disposable loopback PostgreSQL and refuses a non-loopback URL or production mode. It creates/drops its own randomly named schema only. `scripts/capacity-cache-bench.mjs` seeds idle discord.js caches without connecting; it is a lower bound, not the cost of an online bot. The Capacity benchmark workflow stores the full JSON artifact separately from functional CI.

## Existing deployment and observed baseline

| Component | Actual allocation | Observed p95 | Qualification |
|---|---|---|---|
| Web | 0.5 CPU / 512 MiB / one instance | ~111 MiB; ~0.28% of allocated CPU | 5-minute samples under light traffic |
| Worker | 0.5 CPU / 512 MiB / one instance | ~145 MiB; ~0.82% CPU | Media bursts and extra gateways are not represented by idle CPU |
| PostgreSQL 18 | 0.1 CPU / 256 MiB / 1 GB disk | ~119 MiB; ~15.45% CPU; 8 connections | Max sampled connections 13; no HA or disk autoscaling |

Production SQL sizing was unavailable because the database blocks external access. That restriction was preserved. Current disk usage must be read from the existing internal operations monitor; an empty/unknown size is not treated as spare capacity.

## Hard limits versus throughput

| Work | Implemented bound | Consequence |
|---|---|---|
| General HTTP per web process | 48 in flight; 40 requests/s refill with 160 burst tokens | A protection ceiling, not a performance guarantee. IP budget is 10/s with 120 burst. |
| Shared signed-in account admission | 12 in flight, 240 API/min, 2 heavy operations | Isolated account budget, in addition to global ceilings. |
| Heavy work / large transfer | 6 global heavy operations; 1 memory-heavy transfer | Excess returns retry guidance rather than an unbounded queue. |
| Code runtime | 2 processes per worker/web process, 1 per owner per process, 16 MiB QuickJS heap, 64 MiB Node old-space per child | Neither heap limit is a total RSS cap. Slots can remain occupied up to 20 seconds with SDK calls. Third execution gets CODE_BUSY. |
| Music | Default 3 active/starting sessions globally per worker; one guild+bot session; 25 tracks per session | This is not 3 sessions per subscriber. MUSIC_MAX_SESSIONS can override it and must be reviewed before a promise is made. |
| Music source resolution | 2 concurrent lookups, one per guild+bot | Bounds expensive extraction before a session starts. |
| Images | 1 native render, 2 waiting jobs, 2-second wait budget | Remote artwork/network performance is separate. |
| Discord REST worker | 3 queue consumers; conservative per-bot/global request gates | Real Discord bucket/global headers take precedence. Extra servers on the same public bot share limits. |
| Scheduled messages | At most 5 claimed per batch; 5-second polling, serial execution | Empty fast batches imply up to 60 claims/min, not 60 successful sends/min. External latency, permissions and Discord limits lower this. |
| Project schedules | One claimed job per bot/guild scheduler tick, 5-second interval | More stored schedules do not imply simultaneous execution capacity. |
| DB pools | Defaults web 8, worker 5, isolated ledger 2; bounded wait queues | Replica counts multiply pools; provider connection limits alone do not establish safe query throughput. |

The previous scheduled-message poll interval was 30 seconds, approximately 10 claims/min before external latency. This release reduces the poll interval without increasing batch size or overlapping execution. Recovery scans run once/minute and analytics retention once/hour instead of on every batch.

## Initial admission recommendation (planning, not benchmark-proven capacity)

Start with **25 light-use customer accounts**, assuming roughly one small/medium server per customer, at most **5 private bot/server runtime links**, no more than **10 simultaneously active dashboard users** averaging one API read every five seconds, no more than **2 simultaneous music sessions normally** (third slot is headroom), and predominantly short code commands. This is an operating policy, not a newly enforced registration cap. More server members are not automatically more paying customers, and idle accounts do not consume the same capacity as active media users.

Review at **20 accounts** and before accepting **50**. Do not promise unlimited simultaneous music or code. If all 25 customers require music at once, the current envelope is already insufficient regardless of idle memory. A shared public bot avoids a gateway per customer but shares Discord rate limits; private bot/server links add gateways/caches and background schedulers. The current runtime key is guild+bot: one private application linked to several guilds can therefore create several clients, and each client may cache other guilds visible to that application. Count runtime links rather than unique bot IDs and review this architecture before horizontal expansion.

## Upgrade triggers and order

Recommended sustained triggers: CPU above 70% of the allocated CPU for 10 minutes, memory above 70% for 10 minutes or peak above 80%, p95 API latency above 1 second for 5 minutes, 5xx above 1%, normal-workload admission rejections above 1%, DB connection/pool waiting, growing queue age, or repeated voice/code starvation. A load-test overload rejection is expected; a normal customer rejection is a capacity signal. Current operations warnings already cover 440 MiB RSS, queue age >45 seconds and stalled execution; these are emergency warnings, later than the proposed upgrade thresholds.

1. Database: move to `0.5c-1g` when DB CPU/latency is limiting, and increase disk independently before 70% disk use. Keep the 700 MiB application soft limit aligned with actual disk capacity; don't disable it to hide storage pressure. Establish actual growth and retention before estimating customers per GB.
2. Worker: `1c-2g` before expanding to 10 private bot/server runtime links or materially expanding media, or when these signals appear earlier. Five and ten runtime links are conservative review thresholds, not measured connected-gateway maxima. Keep one gateway owner; adding identical worker replicas is not a safe substitute for bot ownership partitioning and shared music admission.
3. Music: use a separately measured audio service (the existing Lavalink integration is available) before offering more than three concurrent sessions broadly. Increasing MUSIC_MAX_SESSIONS alone is not a capacity upgrade. Benchmark the audio server's CPU, streams, bandwidth and reconnect behavior separately.
4. Web: `1c-2g` if authenticated API p95/CPU/memory calls for it. Add stateless replicas only after checking aggregate DB pools, shared limits, job ownership and render workload. Keep infrastructure changes separate from a subscriber price or quota change.
5. Codes: isolate additional execution workers with per-owner fairness and shared quotas before raising the two-process limit. Worst-case 700 ms CPU commands or 20-second SDK waits have radically lower throughput than the short example.

These are recommendations only: this release does not purchase or change Render plans, enable external DB access, raise customer quotas, or deploy a new audio service.

## Evidence and remaining acceptance

- Functional tests cover reservation races, duplicate joins, failed source lookups, owned decoder subprocess cleanup and bounded nonoverlapping schedule batches. Native decoding now has explicit process ownership so stopping/replacing playback also releases its FFmpeg work rather than relying only on final stream disposal.
- Code benchmark measures fresh processes, busy rejection and timeout recovery.
- Media benchmark measures actual Sharp and FFmpeg/volume/Opus packets, including 3 streams mixed with code and cards; it excludes voice encryption/UDP/Discord/YouTube. Parent statistics exclude child processes; CI cgroup CPU and memory additionally include native decoders and code children within the tested service container.
- API benchmark seeds 120 synthetic owners and 60,000 schedules, offers 5/10/20/40/80 RPS and a 60-second recovery period, and reports status distribution, p50/p95/p99, lag and parent RSS. Its database and authentication are fixtures, so do not extrapolate runner RPS directly to Render.
- A production-equivalent isolated Render staging run, authenticated login/session traffic, sustained multi-hour soak and real Discord voice acceptance remain necessary before certifying a higher customer limit. They are explicitly not represented as completed by these artifacts.

## Primary references (checked 22 October 2026)

- [Render compute plans](https://render.com/docs/compute-plans): current CPU/RAM choices; Postgres compute and disk are independent.
- [Render scaling](https://render.com/docs/scaling): replicas, Pro workspace autoscaling and scaling constraints.
- [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits): route/global limits and response-header handling.
- [Discord Gateway](https://docs.discord.com/developers/events/gateway): gateway connections, sessions and sharding constraints.
