# Editable AI reference designs

This continues draft PR #37 and the existing AI request, review and interactive-system paths. It does not execute model-generated code or introduce another ticket, poll or welcome system.

## First release

| Type | Actual function | Approved appearance controls |
| --- | --- | --- |
| Support | Existing private-ticket workflow | Title, description, accent color, final image, image position, ticket-button label/style, HTTPS links |
| Welcome | Existing member-join listener | Text placeholders, accent color, real joining-member avatar, uploaded composite background |
| Poll | Existing per-member vote records | Question, options, accent color, question/option images; option labels remain vote actions |
| Event announcement | Existing registration records | Text, accent color, final media, signup toggle, signup-button label/style, HTTPS links |
| Giveaway | Existing entrants and scheduled draw | Text, accent color, final media, participation-button label/style, HTTPS links |
| Rules | Existing paginated rules renderer | Text, sections, accent color, final image, HTTPS links |
| Ordinary announcement | Existing single-message publisher | Text, final media and reviewed HTTPS links |

Reference images remain private references. They are not automatic publication assets. Vision output is a fixed set of visual data; names, identifiers, URLs, brands, free-form screenshot text and instructions do not enter the planning stage. The customer supplies final images and edits final wording in the review.

Discord controls button styles, dimensions, fonts and message backgrounds. The color picker changes the embed accent border. An image can appear above/below the details or as a thumbnail. A centered member avatar needs the existing composite-image renderer and a customer-supplied final background. These controls do not promise a pixel-identical screenshot.

Other existing independent modules retain their current editors and functions; this release does not claim automatic reference-to-configuration support for all of them.

## Confirmation, editing and recovery

Requests create review drafts only. The authenticated customer chooses the server, selected bot and channel. The execution path verifies ownership, guild permissions, channel membership, staff role, media, links and typed settings. A changed selected bot invalidates a newly scoped draft instead of silently publishing with another identity. Prior reference/context lookup is scoped to customer, conversation, guild and design bot.

Published interactive panels reopen through the same review. Editing targets the existing Discord message with PATCH and keeps its functional IDs. Ticket ownership and existing event/giveaway participants remain intact. Existing poll options cannot change after votes have been collected. Active giveaway prizes, duration and winner count remain fixed. Editing paginated rules preserves their existing page count. Welcome changes only the selected bot's configuration.

A durable publishing state and whitelisted reviewed settings are committed before a Discord mutation. Database failures or uncertain Discord outcomes leave the request blocked for administrative review. No automatic deletion of externally created channels or messages occurs during uncertain recovery. Discord's enforced nonce adds short-term deduplication; the durable barrier is still required after that window.

For a blocked request, inspect the recorded `publication_review`, the selected guild/bot/channel and Discord's message nonce/components before changing state. A message may already exist even if its database insert failed. Do not blindly clear the barrier or send again. Reconcile the real message and its functional record, or verify that no mutation happened, before authorizing a new attempt.

## Local runtime

The existing text model remains on `127.0.0.1:11434`. The tested candidate vision/planning model is Qwen3-VL-4B-Instruct GGUF from the official Qwen repository, running on `127.0.0.1:11436`. Qwen2.5-VL-3B was also tested but its initial descriptions were too imprecise. A capability check rejects text-only vision endpoints. Missing, failed or malformed vision responses produce an explicit failure response with no invented description or executable draft.

`scripts/test-reference-vision.mjs` creates and analyzes four local reference fixtures. `scripts/test-design-conversation.mjs` exercises a support draft and a follow-up color/button-label edit against real local inference. These scripts never connect to the production worker queue and do not publish to Discord. Their outputs are under `outputs/vision-validation` and remain local validation artifacts.

The runtime bootstrap at `D:\GPT 2\diskoko-ai\start-local-ai.ps1` has an explicit DesignPilot switch. Its ordinary path retains the current worker. The new worker refuses activation against a backend without the matching reference-design capability endpoint. Deploying the backend and restarting the serving worker are separate release actions.

## Verification status and release impact

The final local audit passed 265 tests, including functional panel editing, tenant/bot context, uncertain-publication barriers, static assets and credential checks. The actual Qwen3-VL planner preserved a support workflow through a follow-up color/button-label edit.

Real vision inference analyzed four synthetic references and the customer's actual welcome screenshot. It identified welcome content without leaking example names/IDs. Several visual positions remain unknown; explicit customer placement overrides model guesses. Unknown geometry is resolved through the editor instead of claiming a complete match. The PostgreSQL-compatible migration ran twice against a temporary database, retaining existing values and supporting two bot scopes.

The requested test account is Zaraki, in zaraki's server (1036300782972186686); its selected bot 79798 was observed connected. The new flow has not yet completed a live upload-to-Discord round trip. The draft is not release-complete.

Deployment adds publication-state/review and design-bot fields to AI requests and changes welcome uniqueness to guild plus bot scope. It preserves existing welcome row values and retains the legacy public-bot fallback. It also changes new image requests to reference-only handling and adds reviewed appearance/editing controls. These are production-visible changes and need a reviewed rollout, migration verification and an appropriate backup before service activation. A private local backup of the six current welcome rows was captured before release. Production activation and customer live acceptance are separate verification steps.

## Official references

- Discord components: https://docs.discord.com/developers/components/reference
- Discord create/edit messages, nonce and attachment limits: https://docs.discord.com/developers/resources/message
- Discord developer policy: https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy
- Automated user accounts: https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots
- Qwen3-VL GGUF: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF
