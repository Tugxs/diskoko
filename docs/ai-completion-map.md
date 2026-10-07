# AI draft and execution completion map

This branch prepares a common draft contract on the existing system. It is not a production deployment or a claim that every Discord feature is available.

## Existing flow and evidence

`scripts/local-ai-worker.mjs` reads the conversation and reference analysis, proposes approved data, and passes it through `normalizeAiProposal` in `lib/local-ai.js`. `workspace.js` opens the existing editor. Publication uses existing server validators, selected guild/bot checks and publication journals. No generated code is executed.

`lib/ai-draft-contract.js` supplies field descriptions, setup state and model instructions. `lib/ai-capabilities.js` connects existing knowledge entries to these contracts. Missing runtime identifiers are collected by existing server resource selectors. A contract is not proof of permission or successful execution.

| Capability | Existing execution | Boundaries |
| --- | --- | --- |
| Giveaway | Participation and timed draw in interactive-systems | Prize, duration and winner count require customer input; recovery/Discord end-to-end must be retested for this branch |
| Tickets | Private ticket opening and closing | One staff role; multi-department routing requires development |
| Poll | Vote, change vote, results | 2–9 distinct options; no arbitrary workflow |
| Welcome | Member-join configuration and renderer | Real member/server values; reference image is never the final asset |
| Event panel | Optional attendance interaction | Separate from native scheduled events |
| Rules / announcements | Static messages | No invented automation |
| Native event / channel controls | Existing dedicated editors | Dedicated validators; generic contract does not replace them |
| Interests | Existing ordinary role toggle | No creation of roles or automatic approval workflow |
| Forms / FAQ modules | Existing standalone module handlers | Applications do not imply role grant after approval |
| Music | Existing bot workshop | Not an AI conversation executor yet |

## Changes in this branch

- Every conversation is offered to the semantic planner rather than requiring a feature keyword to reach it.
- Incomplete giveaway, ticket, poll and supported module copy remains a draft instead of falling into free-form advice.
- Draft setup metadata is computed by the server, not trusted from the model.
- Missing giveaway numeric values remain blank in the editor. A one-option poll preserves that option and provides a second empty field.
- Customer evidence protects giveaway operational values from invented initial values and ungrounded numeric follow-up changes. This is a bounded first implementation; semantic provenance for all operational fields remains work.
- Publication validators remain mandatory. An incomplete draft cannot be published.

## Existing revision and publication protection

The `save-design` endpoint locks the owned request, checks guild access and selected bot, rejects published/in-flight records and stale design revisions, and retains bounded scene history. This covers the design scene only. A general revision covering content, operation, conversation edits and final publication is not complete. Do not describe the current system as satisfying that entire requirement.

Existing `discord-publication.js` journals protect sends and edits. Uncertain send recovery and restart behavior must be exercised against Discord for the new contract before completion.

## Verification and release boundary

The local audit passed 309 tests, syntax, asset links, content hashes and credential scanning. Real local Qwen3VL tests produced an English incomplete giveaway draft, an Arabic incomplete giveaway draft and an Arabic title/button follow-up retaining the original function and missing values. Earlier attempts exposed malformed JSON and a base-kind/module-kind mismatch; bounded repair, explicit failure handling and approved-kind canonicalization address these failure classes. Results are kept separately in local outputs. This branch has not been deployed. Earlier production role/ticket evidence does not prove the changed planner or this branch's full image-to-Discord flow.

Remaining: complete capability-specific permission/edit/stop/version evidence, generalized revisions and provenance, composite capability plans, professional missing-field presentation across all editors, broader Arabic/English/model/image tests, and Discord publication/interaction/failure/restart verification. Production publication requires the independent authorization specified in the supplied completion requirements.
