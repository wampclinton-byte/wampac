(function () {
  function sync() {
    var d = document.getElementById('page-dashboard');
    document.body.classList.toggle('on-dashboard', !!(d && d.classList.contains('active')));
  }
  function init() {
    var d = document.getElementById('page-dashboard');
    if (!d) return;
    new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
