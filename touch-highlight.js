// Highlights the property card under the user's finger. While the finger stays down
// and the page scrolls, the highlight follows to whichever card is under the finger.
(function () {
  var SEL = '#listings-grid, #sales-grid';
  var cur = null, tid = 0, down = false, x = 0, y = 0, raf = 0, lastTouch = 0;

  function set(c) {
    if (c === cur) return;
    if (cur) cur.classList.remove('is-touched');
    cur = c;
    if (c) c.classList.add('is-touched');
  }
  function cardAt(el) {
    if (!el || !el.closest) return null;
    return el.closest('#listings-grid .wp-card, #sales-grid .wp-card');
  }
  function update() {
    raf = 0;
    if (!down) return;
    var el = document.elementFromPoint(x, y);
    var c = cardAt(el);
    if (c) set(c);
    else if (!(el && el.closest && el.closest(SEL))) set(null);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(update); }
  function release(delay) {
    down = false;
    clearTimeout(tid);
    tid = setTimeout(function () { set(null); }, delay);
  }

  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; if (!t) return;
    lastTouch = Date.now();
    clearTimeout(tid);
    x = t.clientX; y = t.clientY;
    var c = cardAt(e.target);
    down = !!c;
    set(c);
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!down) return;
    var t = e.touches[0]; if (!t) return;
    x = t.clientX; y = t.clientY;
    schedule();
  }, { passive: true });

  // Cards slide under a still finger while the page scrolls, so re-check on scroll too.
  window.addEventListener('scroll', function () { if (down) schedule(); }, { passive: true, capture: true });

  document.addEventListener('touchend', function () { release(380); }, { passive: true });
  document.addEventListener('touchcancel', function () { release(120); }, { passive: true });

  // Mouse (desktop) press feedback
  document.addEventListener('mousedown', function (e) {
    if (Date.now() - lastTouch < 800) return;
    var c = cardAt(e.target);
    if (c) { clearTimeout(tid); set(c); }
  });
  document.addEventListener('mouseup', function () {
    if (Date.now() - lastTouch < 800) return;
    release(250);
  });
})();
