/* ═══════════════════════════════════════════════════════════════════
     STORAGE SHIM  —  _LS (localStorage) and _SS (sessionStorage)
     Android content:// and file:// URLs block both Web Storage APIs.
     This shim tries the real API first; if it throws or silently fails
     it falls back to a plain JS object that lives in memory for the
     lifetime of the tab.  Every localStorage / sessionStorage call in
     this file has been renamed to _LS / _SS so this shim intercepts
     100% of storage access with no other code changes needed.
═══════════════════════════════════════════════════════════════════ */
var _LS, _SS;
(function () {
  'use strict';

  function MemStore() {
    var d = {};
    this.getItem    = function (k)    { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; };
    this.setItem    = function (k, v) { d[k] = String(v); };
    this.removeItem = function (k)    { delete d[k]; };
    this.clear      = function ()     { d = {}; };
    this.key        = function (n)    { return Object.keys(d)[n] || null; };
    Object.defineProperty(this, 'length', { get: function () { return Object.keys(d).length; } });
    // Allow for-in iteration (mirrors real Storage)
    this._data = d;
    this._isMemory = true;
  }

  function tryReal(api) {
    try {
      var KEY = '__wampac_probe__';
      api.setItem(KEY, '1');
      if (api.getItem(KEY) !== '1') throw new Error('read-back mismatch');
      api.removeItem(KEY);
      return api;          // real API works
    } catch (e) {
      return new MemStore(); // fall back to memory
    }
  }

  _LS = tryReal(window.localStorage);
  _SS = tryReal(window.sessionStorage);

  // Make _LS iterable the same way real localStorage is (for-in loops in the app)
  if (_LS._isMemory) {
    _LS.__proto__ = {
      hasOwnProperty: function (k) { return Object.prototype.hasOwnProperty.call(_LS._data, k); }
    };
  }
}());
