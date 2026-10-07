# Diskoko AI capability library

This extends the existing AI requests, library, review forms, publishers and bot selection. It does not install a second bot framework or execute generated code.

## Customer workflow

Describe the desired result in Arabic or English, optionally with a reference image. AI proposes a typed draft for a supported function. The reference screenshot is never a final asset. Change the draft in conversation or in its review form; generate the composed-image preview; confirm the bot, channel and functional settings before publication. A saved image design does not publish or activate anything.

The current 23 library entries remain available. `ai-capabilities.js` derives their availability from that same catalog. The supplemental 100 bilingual ideas are knowledge, not 100 additional executors. Ideas distinguish conversation drafts, existing feature editors and development requirements. AI must not claim unsupported games, new bots, payment automation or monitoring are operational.

## Flexible design

Tickets, events, giveaways, rules and ordinary announcements can compose a 1200×480 image from up to 12 typed layers: text, a final uploaded image, and geometric boxes. All image layers currently use the same final uploaded asset. Positions and dimensions are percentages; elements stay within the canvas. Text supports bounded font size, Arial/Tahoma/Verdana, alignment and bold. Images and boxes support circle/square/rounded masks, opacity and borders. Backgrounds can use a bounded two-color gradient. Functional Discord buttons remain outside the image and retain the existing interaction IDs.

The review provides a generated PNG preview, download, layer ordering, add/remove, undo/redo and explicit image-draft saving. Saving is owner/guild/bot scoped, checks a revision number, and refuses published or uncertain reviews. Up to five earlier saved scenes remain with the draft. History is removed from the planning model context. Minor conversational edits use bounded `designEdits`; unknown properties and executable content are discarded. Final PNGs use the existing image validation and publication journal.

Automatic welcome retains its joining-member workflow. Its composed avatar can be circle, square or rounded, at the existing positions and size ranges. The shape is stored in the approved background metadata and applied to PNG/GIF at join time. Native Discord thumbnails remain native; the composite requires a final background. Dynamic text inside arbitrary composed scenes is not enabled for welcome in this version; title and description still resolve real member/guild variables.

## Languages

AI interface language is per account, with Auto, Arabic and English choices. It localizes UI controls and existing library titles/prompts without translating customer text or native Discord previews. The requested response language is stored on each request. Explicit language instructions take priority over the interface preference. Card content language is separate from conversation language. English voice input uses `en-US`; Arabic uses `ar-SA`. The rest of the website has its existing language behavior.

## Local knowledge and models

`build-ai-knowledge-index.mjs` indexes only the public capability catalog and the 100 curated ideas. Qwen3-Embedding-0.6B-Q8_0 runs locally on 11437. Retrieval sends the current prompt only to this loopback endpoint, stores no customer query, validates the corpus hash, and falls back to keyword playbooks if unavailable. A stale index is never treated as current capabilities. Rebuild the index after changing the corpus.

Default vision/planning remains Qwen3VL-4B on 11436, with existing text service on 11434. Optional Qwen3-14B-Q5_K_M on 11438 is available for evaluation/quality planning; it is slower in the measured local tests and is not automatically selected. Use `start-local-ai.ps1 -QualityPlanning` only with that verified server already running. Both downloaded model files were verified against official pinned Hugging Face SHA256 values. Models and the local index stay outside Git and Render.

## Production impact

Migration adds nullable `ai_requests.response_language`. Existing customer panel settings are not rewritten. Both existing Render services deploy from `main` and can restart briefly. Backend `flexibleDesignVersion=1` must be live before starting the new worker. Existing welcome backgrounds without shape metadata retain circular avatars. No Discord publication, channel creation or activation occurs from deploying this change.

## References

- Discord components: https://docs.discord.com/developers/components/reference
- Discord messages: https://docs.discord.com/developers/resources/message
- Existing image processing: https://github.com/lovell/sharp
- Optional editor libraries investigated: https://github.com/konvajs/konva and https://github.com/fabricjs/fabric.js; neither was added because the bounded existing review path can render these controls without introducing another editor framework.
- Existing voice/music ecosystem: https://github.com/discordjs/discord.js/tree/main/packages/voice, https://github.com/shipgirlproject/Shoukaku, https://github.com/lavalink-devs/Lavalink. These libraries do not become AI executors merely by being downloaded.
- Planning model: https://huggingface.co/Qwen/Qwen3-14B-GGUF/tree/530227a7d994db8eca5ab5ced2fb692b614357fd
- Embedding model: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/tree/370f27d7550e0def9b39c1f16d3fbaa13aa67728

Local unit tests, real local model inference and browser rendering are separate evidence from live Discord publication and button interaction. Do not mark the rollout accepted until the latter are verified.
