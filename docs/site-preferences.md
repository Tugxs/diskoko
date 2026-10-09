# Site preferences

`site-preferences.js` mounts Arabic/English and background controls in the shared header. The language and two background colors are stored per browser and synchronized across its tabs. Preferences do not change the Discord bot's configured response language.

`site-translations.js` contains reviewed interface strings and dynamic templates. Dynamic templates use numbered placeholders; keep the same slots in both languages. The runtime inserts captured values as text, never as HTML.

Mark customer names or content with `data-i18n-preserve`. Discord previews, chat messages, form values and Discord-ID options are preserved automatically. Switching language restores the original Arabic text and does not rerender editors or discard drafts.

When adding an interface string, add its English entry to the catalog. Run `node --test tests/site-language-coverage.test.js tests/site-preferences.test.js` and `node scripts/audit-all.mjs`. Verify new dynamic dialogs in both languages. The background setting keeps a dark base to preserve contrast and follows reduced-motion preferences.
