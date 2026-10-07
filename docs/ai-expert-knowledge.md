# Expert knowledge expansion

The existing worker retrieves curated knowledge; no separate AI system is introduced.
The corpus now includes 24 source-linked expert records alongside the existing
capability registry and 100 design ideas. Records distinguish reviewed drafts,
existing workshop editors and capabilities that need development. The semantic
index is rebuilt locally and contains public knowledge only.

Sources checked on 2026-10-07:

- Discord API docs / component reference: https://docs.discord.com/developers/components/reference
- Official docs repository: https://github.com/discord/discord-api-docs
- JavaScript SDK, builders and voice references: https://github.com/discordjs/discord.js
- Audio node architecture: https://github.com/lavalink-devs/Lavalink
- Python API alternative: https://github.com/Rapptz/discord.py
- JavaScript bot framework: https://github.com/sapphiredev/framework

These are independently written planning summaries, not imported repository code
or instructions. Code reuse must have a separate license, dependency and security
review. Repository knowledge does not enable an executor.

Current music support is in the existing Interactive panels workshop: `music_panel`
uses `normalizeMusicPanel` and guild/bot-scoped playback sessions. A music draft
inside AI conversation is still absent; audio runtime/source availability is not
proven by knowing the architecture. Do not present it as a published AI music bot.

The module editor groups content, destination/function, and appearance. Published
settings preserve layer metadata, start with the current final image unchanged,
and hide the unavailable unpublished-draft save action. Re-composing image layers
requires uploading their final source asset again; text/shape layers remain editable.
Native card direction follows Discord while each text field preserves its own
Arabic/English direction. Review and confirmation remain separate steps.
