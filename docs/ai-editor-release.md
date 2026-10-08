# Visual AI editor release

The existing draft/review/apply lifecycle remains authoritative. Module editors now show content, appearance and operation beside the live preview; native existing panel previews use the same inspector layout. Inputs are moved, never copied, so original validation and publication handlers continue to read them.

Standalone modules keep their actual handler button and add up to four HTTPS link buttons. Server review and apply validate these again. Image placement is restricted to embed image below text or top-right thumbnail. Composed-image controls remain separate from native Discord buttons. Existing configurations default to their former image placement and preserve stored links during edits.

The module inspector supports bounded undo/redo for named text/settings/link fields. Uploaded files and composed-image layer history have their own existing controls and are not promised as part of generic undo.

The capability library remains starter messages; runtime capabilities come from approved schemas and handlers. This release does not add arbitrary code execution, arbitrary workflows, music execution through AI, or new permission models. Reference-image end-to-end verification and composite workflows remain separate required work.

Release verification must include local audit, GitHub checks, both existing Render services, and live client editor/publication acceptance. Local tests alone do not prove Discord interaction.
