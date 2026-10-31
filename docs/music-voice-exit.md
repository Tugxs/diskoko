# Music session lifetime on bot departure

A session watches Discord `voiceStateUpdate` for its actual bot user, guild and playback room. A confirmed departure (disconnect, kick or move out of that room) closes that session once. It unregisters its watcher, clears the queue/progress timer, stops source and owned decoder work, releases the session admission slot and leaves/destroys the voice connection. The original card is refreshed to the idle state. There is no automatic rejoin or replay.

Other members leaving, mute/deafen events, unrelated bots and unrelated guilds do not stop the session. The owner explicitly selected bot departure only; being alone in the room does not stop music. An explicit stop/end unregisters the watcher as well. An audio fetch that completes after closure is destroyed instead of reviving playback.

Separately, production logs on 31 October 2026 show the Lavalink endpoint refusing socket connections with HTTP 429 at 02:28:52, 02:28:58 and 02:29:03 UTC. This explains an unavailable audio-node path; Discord Administrator permissions do not fix an upstream connection limit. This patch does not claim to remove the provider's limit or provision a new audio node. No external host/password was exposed or changed, and no customer session was deliberately disconnected during verification.

Event tests cover bot disconnect and repeated events, moving rooms, other users/guilds, mute/deafen, joins, watcher disposal and rejected cleanup. Full application CI is required before deployment; these tests do not constitute live Discord audio acceptance.
