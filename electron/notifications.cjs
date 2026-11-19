'use strict';

function isForeground(window) {
  return !!(window && !window.isDestroyed?.() && window.isFocused?.() &&
    window.isVisible?.() !== false && window.isMinimized?.() !== true);
}

// Keep native notifications alive until they close, including while Paddock is in
// the tray. The same activation path handles Windows toast and balloon clicks.
class DockNotifications {
  constructor({ Notification, getTray, getWindow, setMode, reveal, publish, icon }) {
    Object.assign(this, { Notification, getTray, getWindow, setMode, reveal, publish, icon });
    this.live = new Set(); this.balloonClick = null;
  }
  async open(item) {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    this.reveal();
    await this.setMode('dashboard');
    if (window.isDestroyed()) return;
    this.reveal(); this.publish();
    window.webContents.send('dock:notice', item);
  }
  show(item) {
    if (isForeground(this.getWindow())) return;
    const activate = () => this.open(item).catch(() => this.reveal());
    const fallback = () => {
      if (isForeground(this.getWindow())) return;
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
module.exports = { DockNotifications, isForeground };
