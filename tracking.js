(() => {
  const consentKey = 'owf_analytics_consent_v1';
  const panel = document.querySelector('#trackingConsent');
  const manageButton = document.querySelector('#privacySettings');
  const acceptButton = document.querySelector('#acceptTracking');
  const rejectButton = document.querySelector('#rejectTracking');
  let consent = null;
  let pixelInstallPromise = null;
  let pixelInstalled = false;
  let pageViewSent = false;
  let leadEventQueued = false;
  let leadPending = false;

  try {
    const savedConsent = localStorage.getItem(consentKey);
    if (savedConsent === 'granted') consent = true;
    if (savedConsent === 'denied') consent = false;
  } catch { /* Keep consent in memory if browser storage is unavailable. */ }

  function showConsentPanel(moveFocus = true) {
    panel.hidden = false;
    if (moveFocus) acceptButton.focus({ preventScroll: true });
  }

  function saveConsent(value) {
    consent = value;
    try { localStorage.setItem(consentKey, value ? 'granted' : 'denied'); } catch { /* In-memory choice remains active for this page. */ }
    panel.hidden = true;
    if (value) installPixel();
    else if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
    manageButton.focus({ preventScroll: true });
  }

  async function installPixel() {
    if (consent !== true || pixelInstalled) return;
    if (pixelInstallPromise) return pixelInstallPromise;
    pixelInstallPromise = (async () => {
      try {
        const response = await fetch('/api/meta-pixel-config', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) return;
        const config = await response.json();
        const pixelId = String(config.pixelId || '');
        if (consent !== true || !/^\d{5,20}$/.test(pixelId)) return;

        if (!window.fbq) {
          const fbq = window.fbq = function () {
            if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
            else fbq.queue.push(arguments);
          };
          if (!window._fbq) window._fbq = fbq;
          fbq.push = fbq;
          fbq.loaded = true;
          fbq.version = '2.0';
          fbq.queue = [];
          const script = document.createElement('script');
          script.async = true;
          script.src = 'https://connect.facebook.net/en_US/fbevents.js';
          document.head.appendChild(script);
        }

        window.fbq('set', 'autoConfig', false, pixelId);
        window.fbq('init', pixelId);
        if (!pageViewSent) {
          window.fbq('track', 'PageView');
          pageViewSent = true;
        }
        pixelInstalled = true;
        if (leadPending && !leadEventQueued) {
          window.fbq('track', 'Lead');
          leadEventQueued = true;
          leadPending = false;
        }
      } catch {
        // Analytics are optional; a blocked Pixel must never affect application submission.
      } finally {
        pixelInstallPromise = null;
      }
    })();
    return pixelInstallPromise;
  }

  function trackLead() {
    if (consent !== true || leadEventQueued || leadPending) return;
    if (pixelInstalled && typeof window.fbq === 'function') {
      leadEventQueued = true;
      window.fbq('track', 'Lead');
      return;
    }
    leadPending = true;
    installPixel();
  }

  acceptButton.addEventListener('click', () => saveConsent(true));
  rejectButton.addEventListener('click', () => saveConsent(false));
  manageButton.addEventListener('click', () => showConsentPanel());

  if (consent === null) showConsentPanel(false);
  else if (consent) installPixel();

  window.metaTracking = Object.freeze({ trackLead });
})();
