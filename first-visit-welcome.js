// First-visit welcome: shown once per device, never blocks the page.
(function(){
  try {
    if (!_LS || _LS.getItem('wampac_first_welcome')) return;
    setTimeout(function(){
      try { showToast('👋 Welcome to Wampac! Tap Rental or Sales (top left), then choose your country.', 'success', 6000); } catch(e){}
      try { _LS.setItem('wampac_first_welcome', '1'); } catch(e){}
    }, 1800);
  } catch(e){}
})();
