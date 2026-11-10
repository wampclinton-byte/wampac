// ════════════════════════════════════════════════════════════════════
// APP NAVIGATION + PHONE BACK BUTTON  v4
// One shared "layer stack" drives BOTH the phone's system back button
// and the on-screen back buttons, in rental AND sales mode.
//
//  • Every time the user goes deeper (page, browse step, detail sheet,
//    modal, photo viewer, menu, search focus, wizard step) a layer is
//    recorded and one browser-history entry is pushed.
//  • Phone back  → popstate  → the top layer is undone.
//  • On-screen back → uiBack() → history.back() → the same popstate path,
//    so both always agree and no history entry is left behind.
//  • Layers closed by other means (✕, tapping outside, flows that move
//    on by themselves) are detected as "no longer live" and skipped
//    silently, so a back press never feels dead.
//  • At the very first screen, back leaves the app as normal.
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const NAV = [];              // layers, oldest → newest
  let _seq = 0;                // layer id counter (0 = the root entry)
  let _lock = false;           // true while undoing: wrappers must not push
  let _histOK = true;          // false if the browser refuses pushState

  const $ = id => document.getElementById(id);
  const shown = id => { const e = $(id); return !!e && e.style.display !== 'none' && getComputedStyle(e).display !== 'none'; };
  const hasOpen = id => { const e = $(id); return !!e && e.classList.contains('open'); };
  const curPage = () => { const a = document.querySelector('.page.active'); return a ? a.id.replace(/^page-/, '') : null; };
  const fn = name => (typeof window[name] === 'function') ? window[name] : null;

  // ── layer stack core ──────────────────────────────────────────────
  function push(layer) {
    if (_lock) return;
    layer.id = ++_seq;
    NAV.push(layer);
    try { history.pushState({ wampac: 1, id: layer.id }, ''); }
    catch (e) { _histOK = false; }
  }

  function topLive() {
    for (let i = NAV.length - 1; i >= 0; i--) { if (NAV[i].live()) return NAV[i]; }
    return null;
  }

  // Undo layers (newest first) until `targetId` is the top. Returns true if anything visible changed.
  function unwindTo(targetId) {
    let changed = false;
    _lock = true;
    try {
      while (NAV.length && NAV[NAV.length - 1].id !== targetId) {
        const l = NAV.pop();
        let isLive = false;
        try { isLive = l.live(); } catch (e) {}
        if (isLive) {
          let r; try { r = l.undo(); } catch (e) { r = false; }
          if (r !== false) changed = true;
        }
      }
    } finally { _lock = false; }
    return changed;
  }

  // Legacy full-screen country splash (if ever visible) is just closed.
  function closeSplashIfOpen() {
    const ov = $('country-splash-overlay');
    if (ov && ov.style.display !== 'none') {
      ov.style.display = 'none'; ov.style.opacity = '1'; ov.style.transform = 'none';
      return true;
    }
    return false;
  }

  // ── phone / browser back ──────────────────────────────────────────
  window.addEventListener('popstate', function (e) {
    const st = e.state;
    const targetId = (st && st.wampac) ? st.id : 0;

    // Moved FORWARD onto an entry we already undid → can't redo, step back again.
    if (targetId > 0 && !NAV.some(l => l.id === targetId)) {
      try { history.back(); } catch (x) {}
      return;
    }

    let changed = unwindTo(targetId);
    if (closeSplashIfOpen()) changed = true;

    // Only stale entries were consumed (nothing visibly changed): keep going so a
    // single press always does something — or leaves the app if we are at the root.
    if (!changed) { try { history.back(); } catch (x) {} }
  });

  // ── on-screen back buttons ────────────────────────────────────────
  // keys: layer key (or list of keys) this button is meant to undo.
  window.uiBack = function (keys, fallback) {
    keys = [].concat(keys);
    const top = topLive();
    if (_histOK && top && keys.indexOf(top.key) !== -1) {
      const id = top.id;
      try { history.back(); } catch (x) { return fallback && fallback(); }
      // Safety net: if the browser never delivers popstate, undo directly.
      setTimeout(function () {
        if (NAV.some(l => l.id === id)) unwindTo(NAV.filter(l => l.id < id).pop() ? NAV.filter(l => l.id < id).pop().id : 0);
      }, 450);
      return;
    }
    return fallback && fallback();
  };

  // ── originals ─────────────────────────────────────────────────────
  const O = {};
  ['showPage','showPageDirect','openModal','closeModal','openPropDetail','openSalesPropDetail',
   'closePropDetail','openLightbox','closeLightbox','selectCountry','selectProvince',
   'selectSalesCountry','goBackFromListings','goBackToCountry','goBackToProvince',
   'salesBrowseBack','salesListingsBack','leaveSalesMode','heroSearchEnterFocusMode',
   'heroSearchExitFocusMode','toggleHamburgerMenu','closeHamburgerMenu','lfGoToStep','showWizardStep']
    .forEach(n => { O[n] = fn(n); });

  // ── pages (rental + sales) ────────────────────────────────────────
  function undoPage(l) {
    const from = l.from, to = l.to;
    const inSales = (typeof _appMode !== 'undefined') && _appMode === 'sales';
    if ((from === 'dashboard') && (typeof currentUser === 'undefined' || !currentUser)) return false;
    if ((from === 'admin') && (typeof adminSession === 'undefined' || !adminSession)) return false;

    if (to === 'listings' && from === 'home' && O.goBackFromListings) { O.goBackFromListings(); return; }
    if (to === 'sales' && from === 'sales-browse' && O.salesListingsBack) { O.salesListingsBack(); return; }
    if (to === 'sales-browse' && from === 'home' && O.leaveSalesMode) { O.leaveSalesMode(); return; }

    if (from && from.indexOf('sales') === 0) {
      // Going back INTO a sales page after the user switched to rental → re-enter sales mode
      if (!inSales && typeof setAppMode === 'function') { setAppMode('sales'); return; }
      if (O.showPageDirect) { O.showPageDirect(from); return; }
    }
    if (O.showPage) O.showPage(from || 'home');
  }

  function afterNav(from) {
    const to = curPage();
    if (!to || !from || to === from) return;
    push({
      key: 'page:' + to, kind: 'page', from: from, to: to,
      live: () => curPage() === to,
      undo: function () { return undoPage(this); }
    });
  }

  if (O.showPage) window.showPage = function (id) {
    const from = curPage(); const r = O.showPage.apply(this, arguments); afterNav(from); return r;
  };
  if (O.showPageDirect) window.showPageDirect = function (id) {
    const from = curPage(); const r = O.showPageDirect.apply(this, arguments); afterNav(from); return r;
  };

  // ── rental browse steps: country → province → area ────────────────
  function stepLayer(key, visibleId, undoFn) {
    push({ key: key, kind: 'step', live: () => shown(visibleId) && curPage() === 'home', undo: undoFn });
  }
  if (O.selectCountry) window.selectCountry = function () {
    const wasProv = shown('step-province');
    const r = O.selectCountry.apply(this, arguments);
    if (!wasProv && shown('step-province')) stepLayer('step:province', 'step-province', () => O.goBackToCountry && O.goBackToCountry());
    else if (shown('step-area')) stepLayer('step:area', 'step-area', () => O.goBackToCountry && O.goBackToCountry());
    return r;
  };
  if (O.selectProvince) window.selectProvince = function () {
    const wasArea = shown('step-area');
    const r = O.selectProvince.apply(this, arguments);
    if (!wasArea && shown('step-area')) stepLayer('step:area', 'step-area', () => O.goBackToProvince && O.goBackToProvince());
    return r;
  };

  // ── sales browse step: country → province/state ───────────────────
  if (O.selectSalesCountry) window.selectSalesCountry = function () {
    const had = (typeof _salesBrowseCountry !== 'undefined') && !!_salesBrowseCountry;
    const r = O.selectSalesCountry.apply(this, arguments);
    if (!had && typeof _salesBrowseCountry !== 'undefined' && _salesBrowseCountry) {
      push({
        key: 'sstep:province', kind: 'step',
        live: () => curPage() === 'sales-browse' && !!_salesBrowseCountry,
        undo: () => O.salesBrowseBack && O.salesBrowseBack()
      });
    }
    return r;
  };

  // ── property detail (rental + sales), photo viewer, modals, menu ──
  function overlayLayer(key, overlayId, closeFn) {
    push({ key: key, kind: 'overlay', live: () => hasOpen(overlayId), undo: () => { closeFn && closeFn(); } });
  }
  ['openPropDetail', 'openSalesPropDetail'].forEach(n => {
    if (!O[n]) return;
    window[n] = function () {
      const was = hasOpen('prop-detail-overlay');
      const r = O[n].apply(this, arguments);
      if (!was && hasOpen('prop-detail-overlay')) overlayLayer('detail', 'prop-detail-overlay', O.closePropDetail);
      return r;
    };
  });
  if (O.openLightbox) window.openLightbox = function () {
    const was = hasOpen('lightbox-overlay');
    const r = O.openLightbox.apply(this, arguments);
    if (!was && hasOpen('lightbox-overlay')) overlayLayer('lightbox', 'lightbox-overlay', O.closeLightbox);
    return r;
  };
  if (O.openModal) window.openModal = function (id) {
    const was = hasOpen(id);
    const r = O.openModal.apply(this, arguments);
    if (!was && hasOpen(id)) overlayLayer('modal:' + id, id, () => O.closeModal && O.closeModal(id));
    return r;
  };
  if (O.toggleHamburgerMenu) window.toggleHamburgerMenu = function () {
    const was = hasOpen('hamburger-dropdown');
    const r = O.toggleHamburgerMenu.apply(this, arguments);
    if (!was && hasOpen('hamburger-dropdown')) overlayLayer('menu', 'hamburger-dropdown', O.closeHamburgerMenu);
    return r;
  };

  // ── search field focus mode (tenant tapped the search bar) ────────
  if (O.heroSearchEnterFocusMode) window.heroSearchEnterFocusMode = function () {
    const hero = $('hero-section');
    const was = !!(hero && hero.classList.contains('search-focused'));
    const r = O.heroSearchEnterFocusMode.apply(this, arguments);
    if (!was) push({
      key: 'search', kind: 'overlay',
      live: () => { const h = $('hero-section'); return !!(h && h.classList.contains('search-focused')); },
      undo: () => { const i = $('hero-search-input'); if (i) i.blur(); O.heroSearchExitFocusMode && O.heroSearchExitFocusMode(); }
    });
    return r;
  };

  // ── multi-step wizards: "I am looking for…" and registration ──────
  function lfCurrent() {
    if (typeof LF_STEP_IDS === 'undefined') return -1;
    for (let i = 0; i < LF_STEP_IDS.length; i++) { const e = $(LF_STEP_IDS[i]); if (e && e.style.display !== 'none') return i; }
    return -1;
  }
  if (O.lfGoToStep) window.lfGoToStep = function (idx) {
    const from = lfCurrent();
    const r = O.lfGoToStep.apply(this, arguments);
    if (from >= 0 && idx > from) push({
      key: 'lf', kind: 'step', live: () => lfCurrent() === idx,
      undo: () => O.lfGoToStep(from)
    });
    return r;
  };
  function wizCurrent() {
    const el = Array.prototype.find.call(document.querySelectorAll('#tab-register .wizard-step'), s => s.style.display === 'block');
    return el ? el.id : null;
  }
  if (O.showWizardStep) window.showWizardStep = function (stepId) {
    const from = wizCurrent();
    const r = O.showWizardStep.apply(this, arguments);
    const top = NAV[NAV.length - 1];
    const isBackMove = top && top.key === 'wiz' && top.from === stepId;
    if (from && stepId !== from && !isBackMove) push({
      key: 'wiz', kind: 'step', from: from, live: () => wizCurrent() === stepId,
      undo: () => O.showWizardStep(from)
    });
    return r;
  };

  // Seed the root entry so the first back press from a deeper view is caught.
  try { history.replaceState({ wampac: 1, id: 0 }, ''); } catch (e) { _histOK = false; }
})();
