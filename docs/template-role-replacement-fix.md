# Optional old-role deletion during template replacement

Replacement reviews now preserve old roles by default. The owner must explicitly select `deleteOldRoles: true` in the review request to include old-role deletion. Add mode never deletes old roles. The saved review is authoritative; an apply request cannot expand its scope.

The selected bot reads the executor's actual guild membership. Every role held by the executor is excluded from the deletion plan, regardless of whether it grants Administrator, Manage Guild, or ordinary membership. Existing managed-role and bot-hierarchy protections remain. The review lists protected roles and explains whether old-role deletion is enabled. Retained roles retain their memberships; newly created template roles are not automatically assigned to members.

Before every batch with pending role deletions and immediately before each deletion, membership is checked again. A newly assigned role included in an earlier deletion plan blocks execution before deletion; failed membership reads fail closed. Legacy reviews containing role deletion without the new explicit approval require a new review. Authorization, account/guild ownership, locks, and execution-step deduplication remain enforced.

Production incident evidence: request `5dc0efe5-3963-4a04-9488-e9a4ca3c89f0` on 30 October 2026 at 16:59:32 UTC was rejected by `authorized` at the template apply route before that request's execution. The user holds an Administrator role rather than guild ownership. The old replacement code planned deletion of all non-managed roles below the bot, including the executor's roles. This is a confirmed self-revocation risk; the log alone does not prove which role earlier requests deleted. No production roles were restored or modified during diagnosis.

For a previously interrupted run: inspect Discord and execution history first. If the executor lost administration, the guild owner must restore it. Create a fresh review after the update, leaving role deletion off unless intended. Do not blindly restart a replacement that already created channels/roles: it may create a second replacement structure. No automatic replay or permission bypass is introduced.

Regression coverage includes real mounted review/apply handlers with Discord responses simulated: opt-in true, default false, string true rejected as opt-in, preserved executor role, unrelated deletable role, membership failure, newly assigned protected role, legacy pending deletion, and UI mode switching/reset. These do not constitute a destructive live Discord acceptance test.
