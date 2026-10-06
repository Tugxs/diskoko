import { Player } from 'shoukaku';

// Shoukaku awaits the first update, but later gateway updates are fire-and-forget.
// Keep late REST failures inside the affected music session.
export class GuardedLavalinkPlayer extends Player {
  voiceEstablished = false;

  async sendServerUpdate(connection) {
    try {
      await super.sendServerUpdate(connection);
      this.voiceEstablished = true;
    } catch (error) {
      if (!this.voiceEstablished) throw error;
      this.emit('voiceError', error);
    }
  }
}
