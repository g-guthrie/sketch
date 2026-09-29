// Global app state shared by scenes.

export const app = {
  scenes: {},
  pendingCode: null,
  statusText: null,
  statusUntil: 0,
  toastText: null,
  toastUntil: 0,
  status(text, secs = 6) {
    this.statusText = text;
    clearTimeout(this._st);
    this._st = setTimeout(() => { this.statusText = null; }, secs * 1000);
  },
  toast(text, secs = 2.5) {
    this.toastText = text;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { this.toastText = null; }, secs * 1000);
  },
};
