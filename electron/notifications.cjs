'use strict';

// Keep native notifications alive until they close, including while Dock is in
// the tray. The same activation path handles Windows toast and balloon clicks.
class DockNotifications {
  constructor({ Notification, getTray, getWindow, getMode, setMode, reveal, publish, getSessions, icon }) {
    Object.assign(this, { Notification, getTray, getWindow, getMode, setMode, reveal, publish, getSessions, icon });
    this.live = new Set(); this.balloonClick = null;
  }
  async open(item) {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    this.reveal();
    const hasConsole = item.sessionId && this.getSessions().some(x => x.id === item.sessionId);
    const destination = item.destination || item.resultId || item.reviewId;
    await this.setMode(hasConsole && !destination ? 'fullscreen' : this.getMode() === 'hud' ? 'dashboard' : this.getMode());
    if (window.isDestroyed()) return;
    this.reveal(); this.publish();
    window.webContents.send('dock:notice', item);
  }
  show(item) {
    const activate = () => this.open(item).catch(() => this.reveal());
    const fallback = () => {
      const tray = this.getTray();
      if (tray && process.platform === 'win32') {
        this.balloonClick = activate;
        tray.displayBalloon({ title: item.title, content: item.message || 'Ready for your review.', respectQuietTime: true });
      }
    };
    if (!this.Notification.isSupported()) { fallback(); return; }
    try {
      const notice = new this.Notification({ title: item.title, body: item.message || 'Ready for your review.', icon: this.icon });
      this.live.add(notice);
      notice.once('click', activate);
      notice.once('close', () => this.live.delete(notice));
      notice.once('failed', () => { this.live.delete(notice); fallback(); });
      notice.show();
      if (this.live.size > 64) { const oldest = this.live.values().next().value; oldest.close(); this.live.delete(oldest); }
    } catch { fallback(); }
  }
}
module.exports = { DockNotifications };
