// ════════════════════════════════════════════════════════════════════
// SALES MODE — OWNER ACCOUNTS, LISTING FEES & APPROVAL  (v25)
//  Owner logs in → lists a property for sale → picks a listing period
//  (e.g. 30 days K100, 60 days K200 …) → pays by bank deposit and uploads
//  the receipt → admin approves → property goes live for that period →
//  it auto-hides when the period ends and the owner can renew.
//  Fee tiers are editable by the admin (Admin → Sales tab).
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const LS_FEES = 'wampac_sales_fees';
  const LS_SPAY = 'wampac_sales_payments';
  const DAY = 86400000;
  const DEFAULT_FEES = [ { days: 30, price: 100 }, { days: 60, price: 200 }, { days: 90, price: 300 } ];
  const $ = id => document.getElementById(id);
  const esc = s => escHtml(s == null ? '' : s);

  // ── storage ───────────────────────────────────────────────────────
  function getFees() {
    try {
      const raw = JSON.parse(_LS.getItem(LS_FEES) || 'null');
      if (Array.isArray(raw) && raw.length) return raw.filter(f => f.days > 0).sort((a, b) => a.days - b.days);
    } catch (e) {}
    return DEFAULT_FEES.slice();
  }
  function saveFees(list) { _LS.setItem(LS_FEES, JSON.stringify(list)); }
  function getSPay() { try { return JSON.parse(_LS.getItem(LS_SPAY) || '[]'); } catch (e) { return []; } }
  function saveSPay(l) { _LS.setItem(LS_SPAY, JSON.stringify(l)); }
  const money = n => 'K' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const refOf = id => 'SALE-' + String(id).replace(/\D/g, '').slice(-6);

  // ── expiry: listings auto-hide when their paid period ends ────────
  const _origGetSalesProps = getSalesProps;
  function sweep(list) {
    const now = Date.now(); let changed = false;
    list.forEach(p => {
      if (p.listingStatus === 'live' && p.expiresAt && p.expiresAt <= now) {
        p.listingStatus = 'expired'; p.hidden = true; changed = true;
      }
    });
    return changed;
  }
  window.getSalesProps = function () {
    const list = _origGetSalesProps();
    if (sweep(list)) { try { saveSalesProps(list); } catch (e) {} }
    return list;
  };
  setInterval(function () { getSalesProps(); }, 60000);

  // ── Live countdown for sale listings (same look as rental) ────────
  let _saleExpTimer = null;
  function saleCountdownHTML(p) {
    if (p.listingStatus !== 'live' || !p.expiresAt) return '';
    const u = (k, l) => '<span class="cd-unit"><span class="cd-val" data-u="' + k + '">--</span><span class="cd-lbl">' + l + '</span></span>';
    const sep = '<span class="cd-sep">:</span>';
    return '<span class="plan-countdown" data-sale-exp="' + Number(p.expiresAt) + '" data-sale-title="' + escAttr(p.title || '') + '">' +
      u('d', 'days') + sep + u('h', 'hrs') + sep + u('m', 'min') + sep + u('s', 'sec') + '</span>';
  }
  function saleCdTick() {
    const badges = document.querySelectorAll('.plan-countdown[data-sale-exp]');
    if (!badges.length) return;
    const now = Date.now(); const pad = n => String(n).padStart(2, '0'); let expired = null;
    badges.forEach(el => {
      const left = Math.max(0, Number(el.dataset.saleExp) - now);
      const t = Math.floor(left / 1000);
      const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
      const set = (k, v) => { const e = el.querySelector('[data-u="' + k + '"]'); if (e) e.textContent = v; };
      set('d', d); set('h', pad(h)); set('m', pad(m)); set('s', pad(sec));
      el.classList.toggle('urgent', d === 0);
      if (left <= 0) {
        expired = el.dataset.saleTitle || 'your property';
        el.removeAttribute('data-sale-exp'); el.innerHTML = '🔴 Plan Expired'; el.classList.add('urgent');
      }
    });
    if (expired !== null) {
      clearTimeout(_saleExpTimer);
      _saleExpTimer = setTimeout(function () {
        try { getSalesProps(); renderMySalesSection(); } catch (e) {}
        showToast('⏰ Your plan for "' + expired + '" has expired. Renew to list it again.', '');
      }, 400);
    }
  }
  setInterval(saleCdTick, 1000);

  // ── helpers ───────────────────────────────────────────────────────
  function myProps() { return currentUser ? getSalesProps().filter(p => p.sellerId === currentUser.id) : []; }
  function pendingPayFor(propId) { return getSPay().find(x => x.propId === propId && x.status === 'pending'); }
  function daysLeft(p) { return p.expiresAt ? Math.max(0, Math.ceil((p.expiresAt - Date.now()) / DAY)) : null; }
  function feeSummary() { return getFees().map(f => f.days + ' days — ' + money(f.price)).join('  ·  '); }

  // ── ENTRY POINT: "Sell Your Property" button in Sales Mode ────────
  window.openSellPropertyModal = function () {
    if (!currentUser) {
      window._sellerIntent = true;
      showToast('Create an account or log in to list your property for sale 🏡', 'success');
      openModal('auth-modal');
      return;
    }
    openSalePostModal();
  };

  // ════════════════ LISTING FORM ════════════════
  let _photos = [];
  window.openSalePostModal = function () {
    if (!currentUser) return window.openSellPropertyModal();
    // new listing (not an edit): clear edit state and restore the "list" heading
    window._saleEditId = null;
    (function () {
      const m = $('sale-post-modal'); if (!m) return;
      const h = m.querySelector('.modal-header h3'), s = m.querySelector('.modal-header p');
      if (h) h.textContent = '🏡 List Your Property For Sale';
      if (s) s.textContent = 'Fill in the details, then choose how long to list it.';
    })();
    ['sale-title','sale-price','sale-area','sale-beds','sale-size','sale-address','sale-desc'].forEach(i => { const e = $(i); if (e) e.value = ''; });
    $('sale-type').value = ''; $('sale-currency').value = 'PGK';
    $('sale-phone').value = currentUser.phone || ''; $('sale-email').value = currentUser.email || '';
    _photos = []; renderPhotos();
    window._saleOwnerLat = null; window._saleOwnerLng = null; window.updateSaleOwnerLocationBadge();
    try { _LS.setItem(LS_DASH_MODE, 'sales'); } catch (e) {}
    $('sale-post-error').style.display = 'none';
    const fi = $('sale-photos'); if (fi) fi.value = '';
    // countries
    const cs = $('sale-country'); cs.innerHTML = '<option value="">Select country</option>';
    getAllowedCountries().forEach(c => { const o = document.createElement('option'); o.value = c.code; o.textContent = c.icon + ' ' + c.name; cs.appendChild(o); });
    const home = currentUser.countryCode && getAllowedCountries().find(c => c.code === currentUser.countryCode);
    if (home) cs.value = home.code;
    salePostCountryChanged();
    if (currentUser.province) { const pv = $('sale-province'); if ([...pv.options].some(o => o.value === currentUser.province)) pv.value = currentUser.province; }
    salePopulateAreas(); saleAreaRequestClose();
    $('sale-post-fee-banner').innerHTML = '💳 Listing fee: <b>' + esc(feeSummary()) + '</b><br><span style="font-weight:500;">Pay once per period. Renew any time.</span>';
    salePostTypeChanged();
    salePostRenderPreview();
    // payments off (admin) -> hide the fee banner; button/note follow the switch
    const feeBanner = $('sale-post-fee-banner');
    if (feeBanner) feeBanner.style.display = isPaymentEnabled() ? '' : 'none';
    salePostSyncPublishUi();
    openModal('sale-post-modal');
  };
  // ── map pin (same Leaflet picker the rental landlords use) ───────
  window.updateSaleOwnerLocationBadge = function () {
    const has = window._saleOwnerLat != null && window._saleOwnerLng != null;
    const btn = $('sale-owner-location-btn'), badge = $('sale-owner-location-badge'), co = $('sale-owner-location-coords');
    if (badge) badge.style.display = has ? 'inline-flex' : 'none';
    if (btn) btn.innerHTML = '<span style="font-size:1.1rem;">📍</span> ' + (has ? 'Edit Location' : 'Set Exact Location');
    if (typeof salePostRenderPreview === 'function') salePostRenderPreview();
    if (co) { if (has) { co.textContent = '📌 ' + window._saleOwnerLat.toFixed(6) + ', ' + window._saleOwnerLng.toFixed(6); co.style.display = 'block'; } else co.style.display = 'none'; }
  };
  function openPinPicker(tag, lat, lng) {
    pinPickPropId = tag; pinPickLat = lat; pinPickLng = lng; _prePublishMode = false;
    if (typeof hideGeoPermHelp === 'function') hideGeoPermHelp();
    openModal('location-pin-modal'); updatePinUI();
    setTimeout(function () {
      initPinPickMap(pinPickLat, pinPickLng);
      if (pinPickLat == null || pinPickLng == null) detectGpsLocation(false);
      if (typeof startLandlordLocationDemo === 'function') startLandlordLocationDemo(); else startPinGuide(false);
    }, 80);
  }
  window.openSaleOwnerLocationPicker = function () {
    openPinPicker('__sales_owner__', window._saleOwnerLat != null ? window._saleOwnerLat : null, window._saleOwnerLng != null ? window._saleOwnerLng : null);
  };
  window.saleOwnerEditPin = function (id) {
    const p = _origGetSalesProps().find(x => x.id === id); if (!p) return;
    openPinPicker('__sales_owner_edit__:' + id, p.lat != null ? p.lat : null, p.lng != null ? p.lng : null);
  };
  window.saleOwnerSavePin = function (id, lat, lng) {
    const props = _origGetSalesProps(); const p = props.find(x => x.id === id); if (!p) return;
    p.lat = lat; p.lng = lng;
    if (!saveSalesProps(props)) { showToast('Could not save the pin.', 'error'); return; }
    try { if (typeof refreshAllGrids === 'function') refreshAllGrids(); } catch (e) {}
    renderMySalesSection();
    showToast('📍 Location saved. Buyers can now get directions to this pin.', 'success');
  };
  // ── OWNER: edit an existing sales listing (re-uses the listing form) ──
  window.saleOwnerEdit = function (id) {
    if (!currentUser) return window.openSellPropertyModal();
    const p = _origGetSalesProps().find(x => x.id === id);
    if (!p) { showToast('Listing not found.', 'error'); return; }
    if (p.sellerId !== currentUser.id) { showToast('You can only edit your own listings.', 'error'); return; }
    window._saleEditId = id;
    const set = (i, v) => { const e = $(i); if (e) e.value = (v == null ? '' : v); };
    const ensureOpt = (sel, val, label) => {
      if (!sel || !val || [...sel.options].some(o => o.value === val)) return;
      const o = document.createElement('option'); o.value = val; o.textContent = label || val;
      const last = sel.lastElementChild;
      if (last && last.value === '__add_yourself__') sel.insertBefore(o, last); else sel.appendChild(o);
    };
    // plain text / number fields
    set('sale-title', p.title); set('sale-price', p.price); set('sale-size', p.size);
    set('sale-address', p.address); set('sale-beds', p.beds); set('sale-desc', p.desc);
    set('sale-phone', p.phone || currentUser.phone || ''); set('sale-email', p.email || '');
    set('sale-type', p.type || '');
    // country → province → area cascade (order matters: country change resets currency + provinces)
    const cs = $('sale-country'); cs.innerHTML = '<option value="">Select country</option>';
    getAllowedCountries().forEach(c => { const o = document.createElement('option'); o.value = c.code; o.textContent = c.icon + ' ' + c.name; cs.appendChild(o); });
    const cd = (p.countryCode && WORLD_COUNTRIES.find(c => c.code === p.countryCode)) || WORLD_COUNTRIES.find(c => c.name === p.country);
    const cc = cd ? cd.code : (p.countryCode || '');
    if (cd) ensureOpt(cs, cd.code, (cd.icon ? cd.icon + ' ' : '') + cd.name);
    cs.value = cc; salePostCountryChanged();
    const pv = $('sale-province'); ensureOpt(pv, p.province); pv.value = p.province || '';
    salePopulateAreas();
    const ar = $('sale-area'); ensureOpt(ar, p.area); ar.value = p.area || '';
    const cur = $('sale-currency'); ensureOpt(cur, p.currency || 'PGK'); cur.value = p.currency || 'PGK';
    saleAreaRequestClose(); salePostTypeChanged();
    // photos + pin
    _photos = (getSalesPropImages(id) || []).slice();
    const fi = $('sale-photos'); if (fi) fi.value = '';
    renderPhotos();
    window._saleOwnerLat = p.lat != null ? p.lat : null; window._saleOwnerLng = p.lng != null ? p.lng : null;
    window.updateSaleOwnerLocationBadge();
    $('sale-post-error').style.display = 'none';
    // heading, hide fee banner, button text
    const m = $('sale-post-modal'), h = m.querySelector('.modal-header h3'), s = m.querySelector('.modal-header p');
    if (h) h.textContent = '✏️ Edit Your Property';
    if (s) s.textContent = 'Update the details below. Buyers see the changes straight away.';
    const fb = $('sale-post-fee-banner'); if (fb) fb.style.display = 'none';
    salePostSyncPublishUi();
    salePostRenderPreview();
    openModal('sale-post-modal');
  };
  // ── suburb / area list (same source + admin-approval flow as rentals) ──
  window.salePopulateAreas = function () {
    const sel = $('sale-area'); if (!sel) return;
    const cc = $('sale-country').value, prov = $('sale-province').value;
    const keep = sel.value;
    sel.innerHTML = '';
    const first = document.createElement('option'); first.value = '';
    first.textContent = prov ? '– Choose area –' : 'Select province first'; sel.appendChild(first);
    if (!prov) { salePostRenderPreview(); return; }
    let names = [];
    try {
      if (cc === 'PG') names = (typeof getAREAS === 'function' ? getAREAS() : AREAS).filter(a => (a.province || '') === prov).map(a => a.name);
      else names = JSON.parse(_LS.getItem('wampac_extra_areas') || '[]').filter(a => (a.countryCode || 'PG') === cc).map(a => a.name);
    } catch (e) {}
    names.filter((n, i) => n && names.indexOf(n) === i).sort((a, b) => a.localeCompare(b)).forEach(n => {
      const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
    });
    const add = document.createElement('option'); add.value = '__add_yourself__'; add.textContent = '＋ Add it yourself';
    add.style.fontWeight = '700'; sel.appendChild(add);
    if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
    salePostRenderPreview();
  };
  window.saleAreaRequestOpen = function () {
    if (!$('sale-province').value) { showToast('Choose the province first, then pick or add your area.', 'error'); return; }
    $('sale-area-request-form').style.display = 'block';
    const i = $('sale-area-request-name'); i.value = ''; $('sale-area-request-err').style.display = 'none'; setTimeout(() => i.focus(), 50);
  };
  window.saleAreaRequestClose = function () { $('sale-area-request-form').style.display = 'none'; };
  window.saleAreaRequestSubmit = function () {
    const err = $('sale-area-request-err'); err.style.display = 'none';
    const name = ($('sale-area-request-name').value || '').trim();
    if (!name) { err.textContent = 'Please enter an area name.'; err.style.display = 'block'; return; }
    const cc = $('sale-country').value || 'PG', prov = $('sale-province').value || '';
    const sel = $('sale-area');
    const exists = [...sel.options].find(o => o.value && o.value !== '__add_yourself__' && o.value.toLowerCase() === name.toLowerCase());
    if (exists) { err.textContent = '"' + name + '" is already in the list — please select it above.'; err.style.display = 'block'; sel.value = exists.value; return; }
    const reqs = getAreaRequests();
    if (!reqs.find(r => r.status === 'pending' && r.name.toLowerCase() === name.toLowerCase() && r.province === prov)) {
      reqs.push({ id: 'areq_' + Date.now(), name, province: prov, countryCode: cc, icon: '🏘️',
        landlordId: currentUser ? currentUser.id : null, landlordName: currentUser ? currentUser.name : 'Unknown',
        status: 'pending', submittedAt: Date.now() });
      saveAreaRequests(reqs);
      if (typeof updateAreaRequestBadge === 'function') { try { updateAreaRequestBadge(); } catch (e) {} }
    }
    let opt = [...sel.options].find(o => o.value === name);
    if (!opt) { opt = document.createElement('option'); opt.value = name; sel.insertBefore(opt, sel.lastElementChild); }
    opt.textContent = name + ' (pending admin review)'; sel.value = name;
    saleAreaRequestClose(); salePostRenderPreview();
    showToast('📍 "' + name + '" sent to the admin for review — you can continue your listing.', 'success');
  };

  // ── live preview of the listing exactly as buyers will see it ──
  window.salePostRenderPreview = function () {
    const box = $('sale-live-preview'); if (!box || typeof wpCardHTML !== 'function') return;
    const v = id => { const e = $(id); return e ? (e.value || '').trim() : ''; };
    const EMO = { House:'🏠', Apartment:'🏢', Land:'🌾', Commercial:'🏢', Other:'📦' };
    const type = v('sale-type'), price = Number(v('sale-price')) || 0, cur = v('sale-currency') || 'PGK';
    const beds = (type === 'Land' || type === 'Commercial') ? '' : v('sale-beds');
    const feats = [];
    if (beds) feats.push(wpIco('bed') + escHtml(beds) + ' Bed' + (Number(beds) > 1 ? 's' : ''));
    if (v('sale-size')) feats.push(wpIco('area') + escHtml(v('sale-size')));
    const areaSel = $('sale-area'); const areaTxt = v('sale-area');
    const cs = $('sale-country'); const csName = cs && cs.value && cs.selectedIndex > -1 ? cs.options[cs.selectedIndex].textContent.replace(/^[^A-Za-z]+/, '').trim() : '';
    const loc = [areaTxt, v('sale-province'), (csName && csName !== 'Papua New Guinea') ? csName : null].filter(Boolean).map(escHtml).join(' · ');
    const hasPin = window._saleOwnerLat != null && window._saleOwnerLng != null;
    box.innerHTML = wpCardHTML({
      mode: 'sale', idx: 0, id: 'sale-preview', title: v('sale-title') || 'Your property title',
      images: _photos.slice(), imgPrefix: 'splimg-', countPrefix: 'splcount-', navFn: 'salePreviewNav',
      mediaClick: 'void 0', detailCall: 'void 0', type: type || 'Property', emoji: EMO[type] || '🏡', hideSave: true,
      priceHTML: '<div class="wp-sale-price"><small>' + escHtml(cur) + '</small>' + (price ? price.toLocaleString() : '—') + '</div>',
      ago: 'Just now', ts: Date.now(), location: loc || 'Location will appear here', feats,
      placeholderHTML: '<div class="wp-ph">' + (EMO[type] || '🏡') + '<small>Add photos — buyers see them here</small></div>',
      dirUrl: hasPin ? buildMapsUrl(v('sale-address'), v('sale-province'), window._saleOwnerLat, window._saleOwnerLng) : '',
      contactLabel: 'Contact', contactCall: 'void 0'
    });
  };
  window.salePreviewNav = function (e, id, dir) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    if (!_photos.length) return;
    window._salePrevIdx = (((window._salePrevIdx || 0) + dir) % _photos.length + _photos.length) % _photos.length;
    const img = document.getElementById('splimg-' + id), c = document.getElementById('splcount-' + id);
    if (img) img.src = _photos[window._salePrevIdx]; if (c) c.textContent = (window._salePrevIdx + 1) + ' / ' + _photos.length;
  };
  (function () {
    const m = $('sale-post-modal'); if (!m) return;
    let t = null; const go = () => { clearTimeout(t); t = setTimeout(salePostRenderPreview, 120); };
    m.addEventListener('input', go); m.addEventListener('change', go);
  })();

  window.salePostTypeChanged = function () {
    const t = $('sale-type').value; const w = $('sale-beds-wrap');
    if (w) w.style.display = (t === 'Land' || t === 'Commercial') ? 'none' : 'block';
  };
  window.salePostCountryChanged = function () {
    const code = $('sale-country').value; const sel = $('sale-province');
    sel.innerHTML = '<option value="">' + (code ? 'Select province / state' : 'Select country first') + '</option>';
    if (!code) { salePopulateAreas(); return; }
    const PNG = ['NCD','Morobe','Western Highlands','Madang','Eastern Highlands','Bougainville','East Sepik','Hela','Milne Bay','Southern Highlands','Jiwaka','Simbu','Gulf','Western','Oro','Manus','East New Britain','West New Britain','New Ireland','Central','West Sepik','Enga'];
    const list = code === 'PG' ? PNG
      : ((typeof WORLD_PROVINCES !== 'undefined' && WORLD_PROVINCES[code] && WORLD_PROVINCES[code].length) ? WORLD_PROVINCES[code]
         : ['Capital Region','Northern Region','Southern Region','Eastern Region','Western Region']);
    list.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
    const cd = WORLD_COUNTRIES.find(c => c.code === code);
    if (cd && cd.currency) { const cur = $('sale-currency'); if ([...cur.options].some(o => o.value === cd.currency)) cur.value = cd.currency; }
    salePopulateAreas();
  };

  function compress(file, MAX, q) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.src = url;
    });
  }
  function renderPhotos() {
    const g = $('sale-photo-preview'); if (!g) return;
    if (typeof salePostRenderPreview === 'function') { window._salePrevIdx = 0; salePostRenderPreview(); }
    g.innerHTML = _photos.map((src, i) => '<div class="sp-ph"><img src="' + src + '" alt=""><button type="button" onclick="salePostRemovePhoto(' + i + ')" aria-label="Remove photo">✕</button></div>').join('');
  }
  window.salePostRemovePhoto = function (i) { _photos.splice(i, 1); renderPhotos(); };
  window.salePostAddPhotos = async function (e) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    for (const f of files) {
      if (_photos.length >= 8) { showToast('Maximum 8 photos.', 'error'); break; }
      try { _photos.push(await compress(f, 1000, 0.72)); renderPhotos(); } catch (x) { showToast('Could not read one of the photos.', 'error'); }
    }
    e.target.value = '';
  };

  // Button always says "Publish". The note under it follows the admin's payment
  // switch: ON  -> the listing-period / payment plan opens right after Publish;
  //         OFF -> the property is published immediately, no payment step.
  window.salePostSyncPublishUi = function () {
    const btn = $('sale-post-submit'), note = $('sale-post-note');
    if (window._saleEditId) {
      if (btn) btn.textContent = 'Save changes';
      if (note) note.textContent = 'Your changes are saved to this listing straight away. No new payment is needed.';
      return;
    }
    if (btn) btn.textContent = 'Publish';
    if (!note) return;
    note.textContent = isPaymentEnabled()
      ? 'Next you will choose a listing period. Your property goes live after Wampac confirms your payment.'
      : 'Your property goes live for buyers straight away.';
  };
  window.salePostSubmit = function () {
    const err = $('sale-post-error'); err.style.display = 'none';
    const v = id => ($(id).value || '').trim();
    const title = v('sale-title'), type = v('sale-type'), price = Number(v('sale-price')),
          ccode = v('sale-country'), prov = v('sale-province'), phone = v('sale-phone'), email = v('sale-email');
    if (!currentUser) { showErr(err, 'Please log in first.'); return; }
    if (!title) return showErr(err, 'Please enter a property title.');
    if (!type) return showErr(err, 'Please choose a property type.');
    if (!(price > 0)) return showErr(err, 'Please enter your asking price.');
    if (!ccode) return showErr(err, 'Please choose a country.');
    if (!prov) return showErr(err, 'Please choose a province / state.');
    if (!v('sale-area')) return showErr(err, 'Please choose your suburb / area — or tap “＋ Add it yourself” if it is not listed.');
    if (!phone) return showErr(err, 'Please enter a contact phone number so buyers can reach you.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr(err, 'Please enter a valid email address.');
    if (_photos.length < 1) return showErr(err, 'Please add at least one photo of the property.');
    if (!window._saleEditId && (window._saleOwnerLat == null || window._saleOwnerLng == null)) return showErr(err, 'Please drop a pin on the map to mark the exact location of the property.');

    const cd = WORLD_COUNTRIES.find(c => c.code === ccode);
    // ── EDIT MODE: update the existing record in place (status / expiry / payment untouched) ──
    if (window._saleEditId) {
      const editId = window._saleEditId;
      const eprops = _origGetSalesProps(); const ep = eprops.find(x => x.id === editId);
      if (!ep) return showErr(err, 'This listing no longer exists.');
      if (currentUser && ep.sellerId !== currentUser.id) return showErr(err, 'You can only edit your own listings.');
      Object.assign(ep, {
        title, type, country: cd ? cd.name : ccode, countryCode: ccode, province: prov,
        price, currency: v('sale-currency') || 'PGK',
        beds: (type === 'Land' || type === 'Commercial') ? null : (v('sale-beds') || null),
        size: v('sale-size') || null, area: v('sale-area') || null, address: v('sale-address') || null,
        desc: $('sale-desc').value.trim(), phone, email, editedAt: Date.now()
      });
      if (window._saleOwnerLat != null && window._saleOwnerLng != null) { ep.lat = window._saleOwnerLat; ep.lng = window._saleOwnerLng; }
      if (!saveSalesProps(eprops)) { return showErr(err, '⚠️ Could not save — storage may be full. Try fewer or smaller photos.'); }
      saveSalesPropImages(editId, _photos.slice());
      window._saleEditId = null;
      closeModal('sale-post-modal');
      try { if (typeof refreshAllGrids === 'function') refreshAllGrids(); } catch (e) {}
      renderMySalesSection();
      showToast('✅ Listing updated.', 'success');
      return;
    }
    const id = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const rec = {
      id, title, type, country: cd ? cd.name : ccode, countryCode: ccode, province: prov,
      price, currency: v('sale-currency') || 'PGK',
      beds: (type === 'Land' || type === 'Commercial') ? null : (v('sale-beds') || null),
      size: v('sale-size') || null, area: v('sale-area') || null, address: v('sale-address') || null,
      lat: window._saleOwnerLat, lng: window._saleOwnerLng, desc: $('sale-desc').value.trim(), phone, email, date: Date.now(),
      // owner-submitted listings stay hidden until the listing fee is approved
      sellerId: currentUser.id, sellerName: currentUser.name, ownerSubmitted: true,
      listingStatus: 'draft', hidden: true
    };
    const props = _origGetSalesProps(); props.push(rec);
    if (!saveSalesProps(props)) { return showErr(err, '⚠️ Could not save — storage may be full. Try fewer or smaller photos.'); }
    saveSalesPropImages(id, _photos.slice());

    closeModal('sale-post-modal');
    if (!isPaymentEnabled()) {          // payments switched off by admin → publish free
      publishFree(id);
      return;
    }
    openSalePayModal(id, 'new');
  };
  function publishFree(id) {
    const props = _origGetSalesProps(); const p = props.find(x => x.id === id); if (!p) return;
    p.listingStatus = 'live'; p.hidden = false; p.goLiveAt = Date.now(); p.expiresAt = null; saveSalesProps(props);
    showToast('🎉 Your property is now live for buyers!', 'success');
    showPage('dashboard');
  }

  // ════════════════ PAYMENT ════════════════
  let _pay = { propId: null, kind: 'new', days: null, amount: null, receipt: null, method: 'bank' };
  window.openSalePayModal = function (propId, kind) {
    const p = _origGetSalesProps().find(x => x.id === propId); if (!p) return;
    const fees = getFees();
    _pay = { propId, kind: kind || 'new', days: null, amount: null, receipt: null, method: 'bank' };
    $('sale-pay-error').style.display = 'none';
    $('sale-pay-title').textContent = _pay.kind === 'renew' ? '🔄 Renew Listing' : '💳 Choose Listing Period';
    $('sale-pay-sub').textContent = p.title;
    const perDay = f => f.price / f.days; const best = Math.min.apply(null, fees.map(perDay));
    $('sale-tier-list').innerHTML = fees.map((f, i) =>
      '<div class="sp-tier" data-i="' + i + '" onclick="salePayPick(' + i + ')">' +
        (fees.length > 1 && perDay(f) === best && i > 0 ? '<span class="sp-best">BEST VALUE</span>' : '') +
        '<div><div class="sp-days">' + f.days + ' days</div><div class="sp-per">≈ ' + money(perDay(f)) + ' per day</div></div>' +
        '<div class="sp-price">' + money(f.price) + '</div></div>').join('');
    const bank = getBankDetails();
    $('sale-bank-name').textContent = bank.bankName || ''; $('sale-bank-acct-name').textContent = bank.acctName || '';
    $('sale-bank-acct-num').textContent = bank.acctNum || ''; $('sale-bank-branch').textContent = bank.branch || '';
    $('sale-pay-ref').textContent = refOf(propId);
    salePayClearReceipt();
    ['sale-visa-name','sale-visa-number','sale-visa-expiry','sale-visa-cvv'].forEach(i => { const e = $(i); if (e) e.value = ''; });
    salePayMethod('bank');
    $('sale-pay-submit').style.display = 'block';
    openModal('sale-pay-modal');
    salePayPick(0);
  };
  window.salePayPick = function (i) {
    const f = getFees()[i]; if (!f) return;
    _pay.days = f.days; _pay.amount = f.price;
    document.querySelectorAll('#sale-tier-list .sp-tier').forEach(el => el.classList.toggle('selected', Number(el.dataset.i) === i));
    $('sale-pay-amount').textContent = money(f.price);
    const va = $('sale-visa-amount'); if (va) va.textContent = money(f.price);
  };
  window.salePayMethod = function (m) {
    _pay.method = m === 'visa' ? 'visa' : 'bank';
    const v = _pay.method === 'visa';
    $('sale-sec-bank').style.display = v ? 'none' : '';
    $('sale-sec-visa').style.display = v ? '' : 'none';
    $('sale-tab-bank').classList.toggle('active', !v);
    $('sale-tab-visa').classList.toggle('active', v);
    $('sale-pay-submit').textContent = v ? '💳 Pay with Visa' : 'Submit payment for approval';
    $('sale-pay-error').style.display = 'none';
  };
  window.salePayReceipt = async function (e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Please choose an image (JPG or PNG).', 'error'); return; }
    $('sale-receipt-label').textContent = '⏳ Processing image…';
    try {
      let max = 900, q = 0.72, data = '';
      for (let i = 0; i < 6; i++) { data = await compress(f, max, q); if (data.length * 0.75 <= 350 * 1024) break; max = Math.round(max * 0.8); q = Math.max(0.4, q - 0.07); }
      _pay.receipt = data; $('sale-receipt-thumb').src = data;
      $('sale-receipt-preview').style.display = 'block'; $('sale-receipt-drop').style.display = 'none';
    } catch (x) { showToast('Could not read that image. Try another.', 'error'); }
    $('sale-receipt-label').textContent = 'Tap to upload receipt screenshot';
  };
  window.salePayClearReceipt = function () {
    _pay.receipt = null; const fi = $('sale-receipt-input'); if (fi) fi.value = '';
    $('sale-receipt-preview').style.display = 'none'; $('sale-receipt-drop').style.display = 'flex';
  };
  window.salePaySubmit = function () {
    const err = $('sale-pay-error'); err.style.display = 'none';
    if (!currentUser || !_pay.propId) return;
    if (!_pay.days) return showErr(err, 'Please choose a listing period.');
    const isVisa = _pay.method === 'visa';
    let last4 = '';
    if (isVisa) {
      const name = ($('sale-visa-name').value || '').trim();
      const num = ($('sale-visa-number').value || '').replace(/\s/g, '');
      const exp = ($('sale-visa-expiry').value || '').trim();
      const cvv = ($('sale-visa-cvv').value || '').trim();
      if (!name) return showErr(err, 'Please enter the cardholder name.');
      if (num.length < 15) return showErr(err, 'Please enter a valid card number.');
      if (!exp) return showErr(err, 'Please enter the card expiry date.');
      if (cvv.length < 3) return showErr(err, 'Please enter the CVV.');
      last4 = num.slice(-4);   // only the last 4 digits are ever kept
    } else if (!_pay.receipt) return showErr(err, '📸 Please upload a screenshot or photo of your mobile banking receipt.');
    if (pendingPayFor(_pay.propId)) return showErr(err, 'A payment for this property is already waiting for approval.');
    const props = _origGetSalesProps(); const p = props.find(x => x.id === _pay.propId); if (!p) return;

    const payId = 'spay_' + Date.now();
    let receiptKey = null;
    if (!isVisa) {
      receiptKey = 'wsr_receipt_' + payId;
      try { _LS.setItem(receiptKey, _pay.receipt); } catch (e1) { try { _SS.setItem(receiptKey, _pay.receipt); } catch (e2) {} }
    }
    const list = getSPay();
    list.push({
      id: payId, propId: p.id, kind: _pay.kind, ref: refOf(p.id),
      sellerId: currentUser.id, sellerName: currentUser.name, sellerPhone: currentUser.phone || p.phone || '',
      title: p.title, days: _pay.days, amount: _pay.amount, receiptKey,
      payMethod: isVisa ? 'visa' : 'bank', cardLast4: last4,
      status: 'pending', submittedAt: Date.now(), reviewedAt: null, note: ''
    });
    saveSPay(list);
    if (p.listingStatus !== 'live') p.listingStatus = 'pending';   // live listings keep running while a renewal is reviewed
    p.payNote = ''; saveSalesProps(props);

    closeModal('sale-pay-modal');
    showToast('✅ Payment submitted! Wampac will confirm it shortly and your property will go live.', 'success', 4500);
    if (typeof updateSaleRequestBadge === 'function') updateSaleRequestBadge();
    showPage('dashboard');
  };
  function receiptOf(pay) { if (!pay.receiptKey) return ''; return _LS.getItem(pay.receiptKey) || _SS.getItem(pay.receiptKey) || ''; }

  // ════════════════ OWNER DASHBOARD SECTION ════════════════
  function statusOf(p) {
    if (pendingPayFor(p.id)) return ['status-pending-pay', '⏳ Payment awaiting approval'];
    switch (p.listingStatus) {
      case 'live': return ['status-approved', '🟢 Live'];
      case 'expired': return ['status-rejected', '🔴 Expired — renew to relist'];
      case 'rejected': return ['status-rejected', '❌ Payment rejected'];
      default: return ['status-pending-pay', '🟡 Awaiting payment'];
    }
  }
  function ensureSection() {
    let sec = $('my-sales-section');
    if (!sec) {
      const list = document.getElementById('my-listings-list');
      if (!list || !list.parentNode) return null;
      sec = document.createElement('div'); sec.id = 'my-sales-section';
      list.parentNode.insertBefore(sec, list.nextSibling);
    }
    return sec;
  }
  window.renderMySalesSection = function () {
    const sec = ensureSection(); if (!sec) return;
    if (!currentUser) { sec.innerHTML = ''; return; }
    const mine = myProps().sort((a, b) => b.date - a.date);
    const salesOn = (typeof isSalesModeEnabled !== 'function') || isSalesModeEnabled();
    const EMO = { House:'🏠', Apartment:'🏢', Land:'🌾', Commercial:'🏢', Other:'📦' };
    const cards = mine.map((p, idx) => {
      const imgs = getSalesPropImages(p.id) || []; const st = statusOf(p); const idq = escAttr(p.id);
      const pend = !!pendingPayFor(p.id); const live = p.listingStatus === 'live'; const d = daysLeft(p);
      const needsPay = !pend && (p.listingStatus === 'draft' || p.listingStatus === 'rejected' || !p.listingStatus);
      const renewBtn = !pend && (p.listingStatus === 'expired' || (live && d != null && d <= 14));
      const feats = [];
      if (p.beds) feats.push(wpIco('bed') + p.beds + ' Bed' + (Number(p.beds) > 1 ? 's' : ''));
      if (p.size) feats.push(wpIco('area') + escHtml(p.size));
      const loc = [p.area, p.province, (p.country && p.country !== 'Papua New Guinea') ? p.country : null].filter(Boolean).map(escHtml).join(' · ');
      const hasPin = p.address || (p.lat != null && p.lng != null);
      const vc = p.views || 0;
      const preview = wpCardHTML({
        mode: 'sale', idx: 0, id: p.id, title: p.title, images: imgs,
        imgPrefix: 'dsimg-', countPrefix: 'dscount-', navFn: 'salesCardNav',
        mediaClick: "openSalesPropDetail('" + idq + "')", detailCall: "openSalesPropDetail('" + idq + "')",
        type: p.type, emoji: EMO[p.type] || '🏡', hideSave: true,
        priceHTML: '<div class="wp-sale-price"><small>' + escHtml(p.currency || 'PGK') + '</small>' + Number(p.price).toLocaleString() + '</div>',
        ago: timeAgo(p.publishedAt || p.date), ts: p.publishedAt || p.date,
        pending: !!pend, location: loc || 'Location on request', feats,
        dirUrl: hasPin ? buildMapsUrl(p.address, p.province, p.lat, p.lng) : '', contactLabel: 'Contact', contactCall: ''
      });
      return '<div class="dash-card" data-sale-id="' + idq + '">' +
        '<div class="dash-card-label">👁️ Public preview — exactly what buyers see when browsing</div>' +
        '<div class="dash-wp">' + preview + '</div>' +
        '<div class="dash-card-manage"><div class="dash-manage-head">Manage listing</div>' +
          '<div class="dash-manage-row"><span class="status-pill ' + st[0] + '">' + st[1] + '</span>' + saleCountdownHTML(p) +
            '<div class="my-listing-views-badge' + (vc === 0 ? ' views-zero' : '') + '"><span class="views-eye">👁️</span><span class="views-count">' + vc.toLocaleString() + '</span><span class="views-label">' + (vc === 1 ? 'view' : 'views') + '</span></div></div>' +
          '<div class="my-listing-actions">' +
            '<button class="btn btn-sm dash-edit-btn" onclick="saleOwnerEdit(\'' + idq + '\')">✏️ Edit Listing</button>' +
            (needsPay ? '<button class="btn btn-gold btn-sm" onclick="openSalePayModal(\'' + idq + '\',\'new\')">💳 Pay & publish</button>' : '') +
            (renewBtn ? '<button class="btn btn-gold btn-sm" onclick="openSalePayModal(\'' + idq + '\',\'renew\')">🔄 Renew</button>' : '') +
            '<button class="btn btn-sm" style="background:rgba(13,92,99,0.08);color:var(--teal);" onclick="openSalesPropDetail(\'' + idq + '\')">👁️ Full Preview</button>' +
            '<button class="btn btn-sm" style="background:' + (p.lat != null ? '#dcfce7' : 'rgba(26,115,232,0.08)') + ';color:' + (p.lat != null ? '#166534' : '#1a73e8') + ';" onclick="saleOwnerEditPin(\'' + idq + '\')">📍 ' + (p.lat != null ? 'Edit Location' : 'Add Location') + '</button>' +
            '<button class="btn btn-sm" style="background:var(--grey-light);color:var(--charcoal);" onclick="saleOwnerDelete(\'' + idq + '\')">🗑 Delete</button>' +
          '</div></div></div>';
    }).join('');
    sec.innerHTML =
      '<div class="dashboard-section-title dash-rent-title"><span class="dash-rent-heading">My Sales Listings</span>' +
      (salesOn ? '<button type="button" class="btn btn-gold dash-rent-cta" onclick="openSalePostModal()">＋ List Property for Sale</button>' : '') + '</div>' +
      (salesOn ? '' : '<p class="sp-sell-off">Sales Mode is currently switched off. Your existing sale listings are shown below.</p>') +
      (cards || '<div class="sp-pane-empty">🏡 You have no properties for sale yet.<br>Tap <b>List Property for Sale</b> to add one — you\'ll see exactly how buyers will see it.</div>');
    if (typeof wiRender === 'function') { try { wiRender(); } catch (e) {} }
    try { applyDashMode(); } catch (e) {}
    try { saleCdTick(); } catch (e) {}
  };

  // ════════════════ DASHBOARD MODE: RENTAL / SALES ════════════════
  const LS_DASH_MODE = 'wampac_dash_mode';
  function getDashMode() { try { return _LS.getItem(LS_DASH_MODE) === 'sales' ? 'sales' : 'rent'; } catch (e) { return 'rent'; } }
  window.applyDashMode = function () {
    const salesOn = (typeof isSalesModeEnabled !== 'function') || isSalesModeEnabled();
    const mine = myProps();
    let mode = getDashMode();
    const canSales = salesOn || mine.length > 0;
    if (!canSales) mode = 'rent';
    const sw = $('dash-mode-switch'); if (sw) sw.style.display = canSales ? 'flex' : 'none';
    const r = $('dash-pane-rent'), sl = $('dash-pane-sales');
    if (r) r.style.display = mode === 'rent' ? '' : 'none';
    if (sl) sl.style.display = mode === 'sales' ? '' : 'none';
    const dp = $('page-dashboard'); if (dp) dp.setAttribute('data-dash-mode', mode);
    try { syncListButtonMode(); } catch (e) {}
    const br = $('dash-mode-rent'), bs = $('dash-mode-sales');
    if (br) { br.classList.toggle('active', mode === 'rent'); br.setAttribute('aria-selected', mode === 'rent'); }
    if (bs) { bs.classList.toggle('active', mode === 'sales'); bs.setAttribute('aria-selected', mode === 'sales'); }
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    if (mode === 'sales') {
      set('stat-active', mine.filter(p => p.listingStatus === 'live').length);
      set('stat-total', mine.length);
      set('stat-areas', new Set(mine.map(p => p.province).filter(Boolean)).size);
      set('stat-views', mine.reduce((n, p) => n + (p.views || 0), 0).toLocaleString());
    } else if (window._rentStats) {
      set('stat-active', window._rentStats[0]); set('stat-total', window._rentStats[1]);
      set('stat-areas', window._rentStats[2]); set('stat-views', window._rentStats[3]);
    }
  };
  window.setDashMode = function (mode) {
    try { _LS.setItem(LS_DASH_MODE, mode === 'sales' ? 'sales' : 'rent'); } catch (e) {}
    if (mode === 'sales') { try { renderMySalesSection(); } catch (e) {} }
    applyDashMode();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.saleOwnerDelete = function (id) {
    if (!confirm('Delete this property from Wampac? This cannot be undone.')) return;
    saveSalesProps(_origGetSalesProps().filter(p => p.id !== id));
    try { _SS.removeItem(LS_SALES_IMAGES + id); } catch (e) {}
    renderMySalesSection(); showToast('Property deleted.', 'success');
  };
  // hook the dashboard render (+ resume "list my property" after login)
  const _origRenderDashboard = window.renderDashboard;
  window.renderDashboard = function () {
    const r = _origRenderDashboard.apply(this, arguments);
    window._rentStats = ['stat-active','stat-total','stat-areas','stat-views'].map(i => { const e = $(i); return e ? e.textContent : '0'; });
    if (window._sellerIntent && currentUser) { try { _LS.setItem(LS_DASH_MODE, 'sales'); } catch (e) {} }
    try { renderMySalesSection(); } catch (e) { console.warn(e); }
    try { applyDashMode(); } catch (e) { console.warn(e); }
    if (window._sellerIntent && currentUser) { window._sellerIntent = false; setTimeout(openSalePostModal, 450); }
    return r;
  };

  // ════════════════ ADMIN: FEES + PAYMENT APPROVAL ════════════════
  function admPanel() {
    const inner = $('sa-sales-inner'); if (!inner) return null;
    let p = $('sa-seller-panel');
    if (!p) { p = document.createElement('div'); p.id = 'sa-seller-panel'; inner.insertBefore(p, inner.firstChild); }
    return p;
  }
  let _feeDraft = null;
  window.renderSellerAdminPanel = function () {
    const p = admPanel(); if (!p) return;
    if (!_feeDraft) _feeDraft = getFees().map(f => ({ days: f.days, price: f.price }));
    const pays = getSPay().sort((a, b) => b.submittedAt - a.submittedAt);
    const pending = pays.filter(x => x.status === 'pending'); const done = pays.filter(x => x.status !== 'pending').slice(0, 8);
    const revenue = pays.filter(x => x.status === 'approved').reduce((s, x) => s + x.amount, 0);
    p.innerHTML =
      '<div class="sp-adm-card">' +
        '<div class="sp-adm-title"><span>💰 Owner Listing Fees (Sales Mode)</span></div>' +
        '<div style="font-size:.8rem;color:#6b7280;margin-bottom:12px;">What property owners pay to keep a property listed for sale. Add as many periods as you like.</div>' +
        _feeDraft.map((f, i) =>
          '<div class="sp-adm-row"><input type="number" min="1" inputmode="numeric" value="' + f.days + '" oninput="saleFeeEdit(' + i + ',\'days\',this.value)" aria-label="Days">' +
          '<span style="font-size:.8rem;color:#6b7280;white-space:nowrap;">days · K</span>' +
          '<input type="number" min="0" step="any" inputmode="decimal" value="' + f.price + '" oninput="saleFeeEdit(' + i + ',\'price\',this.value)" aria-label="Price">' +
          '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="saleFeeRemove(' + i + ')">🗑</button></div>').join('') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">' +
          '<button class="btn btn-sm" style="background:#e0f2fe;color:#0369a1;" onclick="saleFeeAdd()">＋ Add period</button>' +
          '<button class="btn btn-teal btn-sm" onclick="saleFeeSave()">Save fees</button></div>' +
      '</div>' +
      '<div class="sp-adm-card" style="border-color:#fde68a;">' +
        '<div class="sp-adm-title"><span>🧾 Owner Payments to Approve</span><span style="font-size:.75rem;color:#6b7280;font-weight:600;">' + pending.length + ' pending · ' + money(revenue) + ' approved</span></div>' +
        (pending.length ? pending.map(x =>
          '<div class="sp-adm-pay"><div style="display:flex;justify-content:space-between;gap:8px;"><b style="font-size:.9rem;">' + esc(x.title) + '</b><span style="font-size:.7rem;font-weight:800;color:#92400e;">' + esc(x.ref) + '</span></div>' +
          '<div style="font-size:.78rem;color:#6b7280;margin:3px 0 8px;">' + esc(x.sellerName) + ' · 📞 ' + esc(x.sellerPhone) + ' · ' + new Date(x.submittedAt).toLocaleString() + (x.kind === 'renew' ? ' · 🔄 renewal' : '') + '</div>' +
          '<div style="font-weight:800;margin-bottom:8px;">' + x.days + ' days · ' + money(x.amount) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            (x.payMethod === 'visa' ? '<span class="btn btn-sm" style="background:#e0e7ff;color:#3730a3;cursor:default;">💳 Visa ····' + esc(x.cardLast4 || '') + '</span>' : '<button class="btn btn-sm" style="background:#ede9fe;color:#6d28d9;" onclick="saleAdminViewReceipt(\'' + x.id + '\')">🖼️ Receipt</button>') +
            '<button class="btn btn-sm" style="background:#d1fae5;color:#065f46;" onclick="saleAdminApprove(\'' + x.id + '\')">✓ Approve</button>' +
            '<button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;" onclick="saleAdminReject(\'' + x.id + '\')">✕ Reject</button></div></div>').join('')
          : '<div style="text-align:center;color:var(--grey);font-size:.85rem;padding:14px 0;">No owner payments waiting.</div>') +
        (done.length ? '<div style="font-size:.74rem;font-weight:800;color:#6b7280;margin:14px 0 6px;text-transform:uppercase;">Recent</div>' + done.map(x =>
          '<div style="display:flex;justify-content:space-between;gap:8px;font-size:.8rem;padding:6px 0;border-top:1px solid #f1f5f9;"><span>' + esc(x.title) + ' · ' + x.days + 'd · ' + money(x.amount) + '</span><b style="color:' + (x.status === 'approved' ? '#16a34a' : '#dc2626') + ';">' + x.status + '</b></div>').join('') : '') +
      '</div>';
  };
  window.saleFeeEdit = (i, k, v) => { if (_feeDraft && _feeDraft[i]) _feeDraft[i][k] = Number(v); };
  window.saleFeeAdd = () => { const last = _feeDraft[_feeDraft.length - 1]; _feeDraft.push({ days: last ? last.days + 30 : 30, price: last ? last.price + 100 : 100 }); renderSellerAdminPanel(); };
  window.saleFeeRemove = i => { if (_feeDraft.length <= 1) return showToast('Keep at least one listing period.', 'error'); _feeDraft.splice(i, 1); renderSellerAdminPanel(); };
  window.saleFeeSave = function () {
    const clean = _feeDraft.filter(f => f.days >= 1 && f.price >= 0);
    if (!clean.length) return showToast('Add at least one valid period.', 'error');
    if (new Set(clean.map(f => f.days)).size !== clean.length) return showToast('Each period (days) must be different.', 'error');
    clean.sort((a, b) => a.days - b.days); saveFees(clean); _feeDraft = clean.map(f => ({ ...f }));
    try { saLog('update', 'Sales owner listing fees updated', clean.map(f => f.days + 'd=K' + f.price).join(', '), 'superadmin'); } catch (e) {}
    renderSellerAdminPanel(); showToast('✅ Listing fees saved.', 'success');
  };
  window.saleAdminViewReceipt = function (id) {
    const x = getSPay().find(p => p.id === id); const img = x && receiptOf(x);
    if (!img) return showToast('No receipt image found.', 'error');
    openLightbox([img], 0, 'Receipt — ' + x.title);
  };
  window.saleAdminApprove = function (id) {
    const list = getSPay(); const x = list.find(p => p.id === id); if (!x || x.status !== 'pending') return;
    const props = _origGetSalesProps(); const p = props.find(q => q.id === x.propId);
    x.status = 'approved'; x.reviewedAt = Date.now(); saveSPay(list);
    if (p) {
      const base = (p.listingStatus === 'live' && p.expiresAt && p.expiresAt > Date.now()) ? p.expiresAt : Date.now();
      p.expiresAt = base + x.days * DAY; p.listingStatus = 'live'; p.hidden = false; p.goLiveAt = p.goLiveAt || Date.now(); p.planDays = x.days; saveSalesProps(props);
    }
    try { saLog('approve', 'Owner sales payment approved', x.title + ' · ' + x.days + ' days · K' + x.amount, 'superadmin'); } catch (e) {}
    renderSellerAdminPanel(); try { renderSalesAdminList(); updateSaleRequestBadge(); } catch (e) {}
    showToast('✅ Approved — property is live for ' + x.days + ' days.', 'success');
  };
  window.saleAdminReject = function (id) {
    const reason = prompt('Reason for rejecting this payment (the owner will see it):', 'Receipt unclear or amount does not match.');
    if (reason === null) return;
    const list = getSPay(); const x = list.find(p => p.id === id); if (!x || x.status !== 'pending') return;
    x.status = 'rejected'; x.reviewedAt = Date.now(); x.note = reason; saveSPay(list);
    const props = _origGetSalesProps(); const p = props.find(q => q.id === x.propId);
    if (p && p.listingStatus !== 'live') { p.listingStatus = 'rejected'; p.payNote = reason; saveSalesProps(props); }
    try { saLog('reject', 'Owner sales payment rejected', x.title + ' — ' + reason, 'superadmin'); } catch (e) {}
    renderSellerAdminPanel(); try { updateSaleRequestBadge(); } catch (e) {}
    showToast('Payment rejected.', 'success');
  };
  // mount the panel whenever the Sales admin tab renders; count pending in the tab badge
  const _origRenderSalesAdminTab = window.renderSalesAdminTab;
  window.renderSalesAdminTab = function () {
    const r = _origRenderSalesAdminTab.apply(this, arguments);
    _feeDraft = null; try { renderSellerAdminPanel(); } catch (e) { console.warn(e); }
    return r;
  };
  const _origBadge = window.updateSaleRequestBadge;
  window.updateSaleRequestBadge = function () {
    if (_origBadge) _origBadge.apply(this, arguments);
    const extra = getSPay().filter(x => x.status === 'pending').length;
    const badge = $('pending-sale-req-badge');
    if (badge && extra) { badge.textContent = (parseInt(badge.textContent, 10) || 0) + extra; badge.style.display = 'inline-flex'; }
  };
})();
