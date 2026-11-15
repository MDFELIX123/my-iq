const _0x1a9e = [60,57,43,35,54,121,122,125,55,62,33,28,56,44,58,43,39,59,37,39,58,62,44,44,37,32,40,49,39,107,32,58,63,106,18,18,116,26,9,7,27,99,107,99,123,54,40,96,49,46,50,62,112,59,32,34,49,33,106,50,55,91,49,106,39,39];
const _0x5b3c = [60,57,43,35,54,121,122,125,55,62,33,28,56,44,58,43,39,59,37,39,58,62,44,44,37,32,40,49,39,107,32,58,63,106,18,18,116,26,9,7,27,99,107,99,123,50,53,98,48,40,38,36,47,39,104,108,39,55,35,44,121,90,58,36,42,48,125,52,49,61,49,99,34,58,102,39,46,45,58,53,55,120];
const _0x7c4e = [60,57,43,35,54,121,122,125,55,62,33,28,56,44,58,43,39,59,37,39,58,62,44,44,37,32,40,49,39,107,32,58,63,106,18,18,116,26,9,7,27,99,107,99,123,62,40,60,108,57,49,43,44,124,45,38,52,54,54,112,59,83,54,43,97,34,54,42];

function _0x3f2d(_b) {
  const _k = 'TM_SECURE_V2_ENCRYPT_LOCK';
  let _s = '';
  for (let _i = 0; _i < _b.length; _i++) {
    _s += String.fromCharCode(_b[_i] ^ _k.charCodeAt(_i % _k.length));
  }
  return _s;
}

const MASTER_DEFAULT_ID = 'TM-7E5F-325D-45FA';
let TARGET_ID = MASTER_DEFAULT_ID;

function getLocalDayKey(d) {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function getNoticeDismissKey(dayKey, rawHtml) {
  const s = (rawHtml || '').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return dayKey + ':' + (h >>> 0).toString(16).padStart(8, '0');
}

function prepareNoticeHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  let cleaned = rawHtml
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .trim();
  if (cleaned.length > 250000) {
    cleaned = cleaned.slice(0, 250000);
  }
  return cleaned;
}

function evaluateNoticeDecision(rawHtml, dismissedKey, todayKey) {
  const html = (rawHtml || '').trim();
  if (!html) return { shouldShow: false, locked: false, pauseScript: false, dismissKey: todayKey };
  if (/<!--\s*TM:OFF\s*-->/i.test(html)) return { shouldShow: false, locked: false, pauseScript: false, dismissKey: todayKey };
  const locked = /<!--\s*TM:LOCK\s*-->/i.test(html);
  const pauseScript = locked || /<!--\s*TM:PAUSE\s*-->/i.test(html);
  const dismissKey = getNoticeDismissKey(todayKey, html);
  if (locked) return { shouldShow: true, locked: true, pauseScript: true, dismissKey: dismissKey };
  if (dismissedKey && dismissedKey === dismissKey) {
    return { shouldShow: false, locked: false, pauseScript: false, dismissKey: dismissKey };
  }
  return { shouldShow: true, locked: false, pauseScript: pauseScript, dismissKey: dismissKey };
}

function renderPopupNoticeMainWorld(rawHtml, isLocked, dayKey, isPaused) {
  if (window.top !== window.self) return;
  if (!rawHtml || document.getElementById('tm-notice-host')) return;
  if (!isLocked) {
    try {
      if (localStorage.getItem('TM_n_day') === dayKey) return;
    } catch (e) {}
  }

  let closed = false;
  let guardObs = null;
  let restoreTimer = null;
  let fallbackTimer = null;
  let frameReady = false;
  let adIframe = null;

  function toTrustedHtml(str) {
    if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
      try {
        const policy = window.__tmHtmlPolicy || window.trustedTypes.createPolicy('tm-html', {
          createHTML: (s) => s
        });
        window.__tmHtmlPolicy = policy;
        return policy.createHTML(str);
      } catch (e) {}
    }
    return str;
  }

  function stripUnsafeForShadow(htmlStr) {
    return String(htmlStr || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, 'blocked:')
      .replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, '');
  }

  const isFullDoc = /<(?:!doctype|html|head|body)\b/i.test(rawHtml) || /position\s*:\s*fixed|min-height\s*:\s*100vh/i.test(rawHtml);

  const host = document.createElement('div');
  host.id = 'tm-notice-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:auto;';
  const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  const baseStyle = document.createElement('style');
  baseStyle.textContent = [
    ':host{all:initial;position:fixed !important;inset:0 !important;z-index:2147483647 !important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important;}',
    '.tm-backdrop{position:fixed !important;inset:0 !important;z-index:2147483647 !important;background:rgba(5,8,15,0.84) !important;display:flex !important;align-items:center !important;justify-content:center !important;padding:16px !important;margin:0 !important;box-sizing:border-box !important;}',
    isFullDoc
      ? '.tm-card{position:relative !important;width:min(94vw,720px) !important;max-width:720px !important;height:min(88vh,740px) !important;max-height:88vh !important;background:#06060b !important;color:#f8fafc !important;border:1px solid rgba(52,211,153,0.35) !important;border-radius:14px !important;box-shadow:0 24px 60px rgba(0,0,0,0.75) !important;overflow:hidden !important;display:flex !important;flex-direction:column !important;margin:0 !important;padding:0 !important;}'
      : '.tm-card{position:relative !important;width:100% !important;max-width:560px !important;max-height:88vh !important;background:#0f172a !important;color:#f8fafc !important;border:1px solid rgba(52,211,153,0.35) !important;border-radius:14px !important;box-shadow:0 24px 60px rgba(0,0,0,0.65) !important;overflow:hidden !important;display:flex !important;flex-direction:column !important;margin:0 !important;padding:0 !important;}',
    '.tm-bar{position:relative !important;z-index:2147483647 !important;flex-shrink:0 !important;display:flex !important;align-items:center !important;justify-content:flex-end !important;padding:8px 12px !important;margin:0 !important;border-bottom:1px solid rgba(148,163,184,0.14) !important;background:rgba(15,23,42,0.98) !important;pointer-events:auto !important;}',
    '.tm-close-btn{position:relative !important;z-index:2147483647 !important;background:#1e293b !important;color:#e2e8f0 !important;border:1px solid #334155 !important;border-radius:6px !important;padding:5px 12px !important;margin:0 !important;font-size:12px !important;font-weight:600 !important;cursor:pointer !important;line-height:1.4 !important;pointer-events:auto !important;user-select:none !important;}',
    '.tm-close-btn:hover{background:#334155 !important;color:#fff !important;}',
    isFullDoc
      ? '.tm-body{position:relative !important;z-index:1 !important;flex:1 1 auto !important;min-height:0 !important;padding:0 !important;margin:0 !important;overflow:hidden !important;display:flex !important;flex-direction:column !important;height:100% !important;transform:translateZ(0) !important;}'
      : '.tm-body{position:relative !important;z-index:1 !important;flex:1 1 auto !important;min-height:0 !important;padding:0 !important;margin:0 !important;overflow-y:auto !important;overflow-x:hidden !important;line-height:1.5;font-size:14px;color:#e2e8f0;display:flex !important;flex-direction:column !important;height:auto !important;transform:translateZ(0) !important;}',
    '.tm-body.tm-shadow-mode{overflow-y:auto !important;overflow-x:hidden !important;display:block !important;padding:16px !important;}',
    '.tm-body.tm-shadow-mode .gate{position:absolute !important;inset:0 !important;}',
    '.tm-body.tm-shadow-mode .mesh,.tm-body.tm-shadow-mode .grid-bg,.tm-body.tm-shadow-mode .noise,.tm-body.tm-shadow-mode .scanlines,.tm-body.tm-shadow-mode .vignette,.tm-body.tm-shadow-mode .mouse-light,.tm-body.tm-shadow-mode .flash,.tm-body.tm-shadow-mode .gbar,.tm-body.tm-shadow-mode .cube,.tm-body.tm-shadow-mode .bolt,.tm-body.tm-shadow-mode #canvas{position:absolute !important;pointer-events:none !important;}'
  ].join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'tm-backdrop';
  const card = document.createElement('div');
  card.className = 'tm-card';

  function onFrameMessage(ev) {
    if (!adIframe || ev.source !== adIframe.contentWindow) return;
    const d = ev.data;
    if (!d || typeof d !== 'object' || !d.__tmAdFrame) return;
    if (d.__tmAdFrame === 'ready') {
      frameReady = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (!isFullDoc && typeof d.h === 'number' && d.h > 20) {
        const targetH = Math.min(Math.max(d.h + 8, 100), Math.round(window.innerHeight * 0.78));
        adIframe.style.height = targetH + 'px';
      }
    } else if (d.__tmAdFrame === 'close' && !isLocked) {
      dismissNow();
    }
  }

  window.addEventListener('message', onFrameMessage);

  function dismissNow(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (isLocked || closed) return;
    closed = true;
    window.removeEventListener('message', onFrameMessage);
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (restoreTimer) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
    if (guardObs) {
      try { guardObs.disconnect(); } catch (e) {}
      guardObs = null;
    }
    try { localStorage.setItem('TM_n_day', dayKey); } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
        detail: JSON.stringify({
          action: 'TM_DISMISS_NOTICE',
          dayKey: dayKey,
          resumePaused: Boolean(isPaused)
        })
      }));
    } catch (e) {}
    try { host.remove(); } catch (e) {}
  }

  if (!isLocked) {
    const bar = document.createElement('div');
    bar.className = 'tm-bar';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tm-close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', dismissNow);
    bar.appendChild(closeBtn);
    card.appendChild(bar);
  }

  const contentWrap = document.createElement('div');
  contentWrap.className = 'tm-body';

  function mountShadowFallback() {
    if (closed || frameReady) return;
    if (adIframe) {
      try { adIframe.remove(); } catch (e) {}
      adIframe = null;
    }
    contentWrap.innerHTML = '';
    contentWrap.classList.add('tm-shadow-mode');

    const safeHtml = stripUnsafeForShadow(rawHtml);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(toTrustedHtml(safeHtml), 'text/html');
      const links = doc.querySelectorAll('link[rel="stylesheet"]');
      for (let i = 0; i < links.length; i++) {
        const href = links[i].getAttribute('href');
        if (href && /^https:\/\//i.test(href)) {
          const lk = document.createElement('link');
          lk.rel = 'stylesheet';
          lk.href = href;
          shadow.appendChild(lk);
        }
      }
      const styles = doc.querySelectorAll('style');
      for (let i = 0; i < styles.length; i++) {
        const st = document.createElement('style');
        const rawCss = styles[i].textContent || '';
        st.textContent = rawCss
          .replace(/:root\b/gi, ':host, .tm-body')
          .replace(/(^|[},\s])body(?=[\s{,:])/gi, '$1.tm-body')
          .replace(/(^|[},\s])html(?=[\s{,:])/gi, '$1.tm-body');
        shadow.appendChild(st);
      }
      if (doc.body) {
        const kids = Array.from(doc.body.childNodes);
        for (let i = 0; i < kids.length; i++) {
          if (kids[i].nodeName && kids[i].nodeName.toUpperCase() === 'SCRIPT') continue;
          contentWrap.appendChild(document.importNode(kids[i], true));
        }
      }
    } catch (e) {
      contentWrap.textContent = safeHtml;
    }

    const gateEl = contentWrap.querySelector('.gate, #gate');
    if (gateEl) {
      gateEl.addEventListener('click', () => {
        gateEl.style.display = 'none';
        const animEls = contentWrap.querySelectorAll('.ad-card, .status, .live, .countdown, h1, .sub, .services-line, .btn, .urgency');
        for (let i = 0; i < animEls.length; i++) {
          animEls[i].style.animationDelay = '0s';
          animEls[i].style.opacity = '1';
        }
      });
    }

    if (!isLocked) {
      const customClosers = contentWrap.querySelectorAll('[data-tm-close]');
      for (let i = 0; i < customClosers.length; i++) {
        customClosers[i].addEventListener('click', dismissNow);
      }
    }
  }

  function buildSrcdocHtml(htmlStr) {
    const cleaned = String(htmlStr || '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '')
      .replace(/<base\b[^>]*>/gi, '')
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
    const bridge = '<style>html,body{overflow-x:hidden !important;overflow-y:auto !important;}</style>' +
      '<script>(function(){try{function sendReady(){try{var h=Math.max(document.body?document.body.scrollHeight:0,document.documentElement?document.documentElement.scrollHeight:0);window.parent.postMessage({__tmAdFrame:"ready",h:h},"*");}catch(e){}}sendReady();if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",sendReady);}document.addEventListener("click",function(e){var c=e.target&&e.target.closest?e.target.closest("[data-tm-close]"):null;if(c){window.parent.postMessage({__tmAdFrame:"close"},"*");}});}catch(e){}})();<\/script>';
    if (/<\/body>/i.test(cleaned)) {
      return cleaned.replace(/<\/body>/i, bridge + '</body>');
    }
    if (/<html\b/i.test(cleaned)) {
      return cleaned + bridge;
    }
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;}html,body{margin:0;padding:16px;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;font-size:14px;}</style></head><body>' + cleaned + bridge + '</body></html>';
  }

  let iframeMounted = false;
  try {
    adIframe = document.createElement('iframe');
    adIframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    adIframe.setAttribute('referrerpolicy', 'no-referrer');
    adIframe.style.cssText = 'width:100%;height:' + (isFullDoc ? '100%' : '220px') + ';flex:1 1 auto;border:0;margin:0;padding:0;display:block;background:' + (isFullDoc ? '#06060b' : '#0f172a') + ';';
    adIframe.srcdoc = toTrustedHtml(buildSrcdocHtml(rawHtml));
    contentWrap.appendChild(adIframe);
    iframeMounted = true;
    fallbackTimer = setTimeout(() => {
      if (!frameReady && !closed) {
        mountShadowFallback();
      }
    }, 750);
  } catch (e) {
    iframeMounted = false;
  }

  if (!iframeMounted) {
    mountShadowFallback();
  }

  shadow.appendChild(baseStyle);
  card.appendChild(contentWrap);
  backdrop.appendChild(card);
  shadow.appendChild(backdrop);

  function mountHost() {
    const target = document.documentElement || document.body;
    if (target && !host.isConnected) {
      target.appendChild(host);
    }
  }

  mountHost();

  if (isLocked && typeof MutationObserver !== 'undefined') {
    let restoreAttempts = 0;
    guardObs = new MutationObserver(() => {
      if (!closed && !host.isConnected && !restoreTimer && restoreAttempts < 15) {
        restoreAttempts += 1;
        restoreTimer = setTimeout(() => {
          restoreTimer = null;
          if (!closed) mountHost();
        }, 250);
      }
    });
    try {
      guardObs.observe(document.documentElement || document.body, { childList: true });
    } catch (e) {}
  }
}

function murmur3(str, seed) {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function computeDeterministicMachineId() {
  const parts = [];

  parts.push(navigator.hardwareConcurrency || 4);

  try {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round((window.screen ? window.screen.width : 1920) * dpr);
    const h = Math.round((window.screen ? window.screen.height : 1080) * dpr);
    const cd = window.screen ? window.screen.colorDepth : 24;
    parts.push(`${w}x${h}x${cd}`);
  } catch (e) {
    parts.push('1920x1080x24');
  }

  try {
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  } catch (e) {
    parts.push('UTC');
  }

  parts.push(navigator.platform || 'Win32');

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '';
        const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
        parts.push(`${vendor}~${renderer}`);
      }
    }
  } catch (e) {}

  const rawFingerprint = parts.join(':::');
  const h1 = murmur3(rawFingerprint, 0x13579BDF);
  const h2 = murmur3(rawFingerprint, 0x2468ACE0);

  return 'TM-' + h1.slice(0, 4) + '-' + h1.slice(4, 8) + '-' + h2.slice(0, 4);
}

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const lockedSection = document.getElementById('lockedSection');
  const activeSection = document.getElementById('activeSection');
  const verifyBtn = document.getElementById('verifyBtn');
  const runTabBtn = document.getElementById('runTabBtn');
  const autoRunCard = document.getElementById('autoRunCard');
  const autoRunToggle = document.getElementById('autoRunToggle');
  const copyBtn = document.getElementById('copyBtn');
  const deviceIdText = document.getElementById('deviceIdText');
  const diagNote = document.getElementById('diagNote');

  function setDiag(msg, tone) {
    if (!diagNote) return;
    if (!msg) {
      diagNote.style.display = 'none';
      diagNote.textContent = '';
      return;
    }
    diagNote.style.display = 'block';
    diagNote.textContent = msg;
    if (tone === 'error') {
      diagNote.style.borderColor = 'rgba(244, 63, 94, 0.45)';
      diagNote.style.color = '#fda4af';
    } else if (tone === 'warn') {
      diagNote.style.borderColor = 'rgba(245, 158, 11, 0.45)';
      diagNote.style.color = '#fcd34d';
    } else {
      diagNote.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      diagNote.style.color = '#6ee7b7';
    }
  }

  TARGET_ID = computeDeterministicMachineId();
  if (deviceIdText) deviceIdText.textContent = TARGET_ID;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ typeme_device_id: TARGET_ID, typeme_window_id_set: true });
    chrome.storage.local.get(['typeme_auto_run'], (res) => {
      if (res && typeof res.typeme_auto_run === 'boolean') {
        if (autoRunToggle) autoRunToggle.checked = res.typeme_auto_run;
      } else {
        if (autoRunToggle) autoRunToggle.checked = true;
        chrome.storage.local.set({ typeme_auto_run: true });
      }
    });
  }

  if (autoRunToggle) {
    autoRunToggle.addEventListener('change', () => {
      const isEnabled = autoRunToggle.checked;
      if (typeof chrome !== 'undefined') {
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ typeme_auto_run: isEnabled });
        }
        try {
          chrome.runtime.sendMessage({ type: 'SET_AUTO_RUN', autoRun: isEnabled });
        } catch (e) {}
      }
    });
  }

  function renderState(isAuthorized) {
    if (isAuthorized) {
      statusBadge.textContent = 'Active';
      statusBadge.className = 'badge badge-active';
      lockedSection.style.display = 'none';
      activeSection.style.display = 'block';
      runTabBtn.style.display = 'flex';
      if (autoRunCard) autoRunCard.style.display = 'flex';
      verifyBtn.textContent = 'License Active (Verified)';
      verifyBtn.style.background = '#059669';
    } else {
      statusBadge.textContent = 'Locked';
      statusBadge.className = 'badge badge-locked';
      lockedSection.style.display = 'block';
      activeSection.style.display = 'none';
      runTabBtn.style.display = 'none';
      if (autoRunCard) autoRunCard.style.display = 'none';
      verifyBtn.textContent = 'Verify License Now';
      verifyBtn.style.background = '#1e293b';
    }
  }

  async function performVerification(idToCheck) {
    const checkId = idToCheck || TARGET_ID;
    verifyBtn.textContent = 'Checking Server...';

    // Prefer serialized verification through background service worker first
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      const bgResult = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'VERIFY_NOW', deviceId: checkId }, (res) => {
            if (chrome.runtime.lastError || !res) {
              resolve(null);
              return;
            }
            resolve(res);
          });
        } catch (e) {
          resolve(null);
        }
      });
      if (bgResult && typeof bgResult.authorized === 'boolean') {
        renderState(bgResult.authorized);
        if (bgResult.authorized) {
          setDiag('', 'ok');
        } else if (bgResult.error) {
          setDiag('Could not reach verification server. Check your internet connection.', 'error');
        } else {
          setDiag('', 'ok');
        }
        return;
      }
    }

    try {
      const res = await fetch(_0x3f2d(_0x1a9e) + '?_t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) {
        renderState(false);
        verifyBtn.textContent = 'Verify License Now';
        setDiag('Could not reach verification server. Please try again.', 'error');
        return;
      }
      const text = await res.text();
      const isMatch = text.toLowerCase().includes(checkId.toLowerCase());
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ typeme_authorized: isMatch, typeme_device_id: checkId, typeme_window_id_set: true });
      }
      renderState(isMatch);
      setDiag('', 'ok');
    } catch (err) {
      setDiag('Connection error while checking license.', 'error');
      try {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
          if (res && res.authorized) renderState(true);
          else verifyBtn.textContent = 'Verify License Now';
        });
      } catch (e) {}
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['typeme_authorized', 'typeme_device_id'], (stored) => {
      chrome.storage.local.set({ typeme_device_id: TARGET_ID, typeme_window_id_set: true });
      if (stored && stored.typeme_authorized) {
        renderState(true);
      }
      performVerification(TARGET_ID);
    });
  } else {
    performVerification(TARGET_ID);
  }

  verifyBtn.addEventListener('click', () => {
    performVerification(TARGET_ID);
  });

  runTabBtn.addEventListener('click', async () => {
    runTabBtn.textContent = 'Activating...';
    runTabBtn.disabled = true;
    setDiag('', 'ok');

    const watchdogTimer = setTimeout(() => {
      if (runTabBtn.disabled) {
        runTabBtn.textContent = '▶ Launch on Current Tab';
        runTabBtn.style.background = '#10b981';
        runTabBtn.disabled = false;
        setDiag('Timed out waiting for script/tab response. Check internet and refresh target tab.', 'warn');
      }
    }, 12000);

    let _scriptBuffer = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        clearTimeout(watchdogTimer);
        runTabBtn.textContent = '⚠️ No Tab Found';
        setDiag('No active browser tab found.', 'error');
        setTimeout(() => {
          runTabBtn.textContent = '▶ Launch on Current Tab';
          runTabBtn.disabled = false;
        }, 2000);
        return;
      }

      const url = tab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
        clearTimeout(watchdogTimer);
        runTabBtn.textContent = '⚠️ Open Target Page First';
        runTabBtn.style.background = '#e11d48';
        setDiag('Cannot run on browser internal pages (' + url.split('/')[0] + '). Open Facebook or a website first.', 'warn');
        setTimeout(() => {
          runTabBtn.textContent = '▶ Launch on Current Tab';
          runTabBtn.style.background = '#10b981';
          runTabBtn.disabled = false;
        }, 3000);
        return;
      }

      const bgInjectRes = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'INJECT_ACTIVE_TAB' }, (res) => {
            if (chrome.runtime.lastError || !res) {
              resolve({ success: false, noResponse: true });
              return;
            }
            resolve(res);
          });
        } catch (e) {
          resolve({ success: false, noResponse: true });
        }
      });

      if (bgInjectRes && bgInjectRes.cspBlocked) {
        clearTimeout(watchdogTimer);
        runTabBtn.textContent = '⚠️ Refresh Tab & Retry';
        runTabBtn.style.background = '#d97706';
        setDiag('Could not run on this tab yet. Reload the page once and click Launch again.', 'warn');
        setTimeout(() => {
          runTabBtn.textContent = '▶ Launch on Current Tab';
          runTabBtn.style.background = '#10b981';
          runTabBtn.disabled = false;
        }, 2800);
        return;
      }

      if (bgInjectRes && bgInjectRes.pausedByNotice) {
        clearTimeout(watchdogTimer);
        runTabBtn.textContent = 'Notice Active on Tab';
        runTabBtn.style.background = '#d97706';
        setDiag('Notice overlay paused script launch until closed on tab.', 'warn');
        setTimeout(() => {
          runTabBtn.textContent = '▶ Launch on Current Tab';
          runTabBtn.style.background = '#10b981';
          runTabBtn.disabled = false;
        }, 2500);
        return;
      }

      if (bgInjectRes && !bgInjectRes.success && !bgInjectRes.noResponse && bgInjectRes.error) {
        clearTimeout(watchdogTimer);
        runTabBtn.textContent = '⚠️ Launch Failed';
        runTabBtn.style.background = '#e11d48';
        setDiag(bgInjectRes.error, 'error');
        setTimeout(() => {
          runTabBtn.textContent = '▶ Launch on Current Tab';
          runTabBtn.style.background = '#10b981';
          runTabBtn.disabled = false;
        }, 3200);
        return;
      }

      const injectedViaBg = Boolean(bgInjectRes && bgInjectRes.success);

      if (!injectedViaBg) {
        let noticeHtml = '';
        let noticeFetchedAt = 0;
        let dismissedDay = '';
        let gmStore = {};
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const cached = await new Promise((resolve) => {
            chrome.storage.local.get(['typeme_ads_html', 'typeme_ads_fetched_at', 'typeme_ads_dismissed_day', 'typeme_gm_store'], (res) => resolve(res || {}));
          });
          if (typeof cached.typeme_ads_html === 'string') noticeHtml = cached.typeme_ads_html;
          if (typeof cached.typeme_ads_fetched_at === 'number') noticeFetchedAt = cached.typeme_ads_fetched_at;
          if (typeof cached.typeme_ads_dismissed_day === 'string') dismissedDay = cached.typeme_ads_dismissed_day;
          if (cached.typeme_gm_store && typeof cached.typeme_gm_store === 'object') gmStore = cached.typeme_gm_store;
        }

        // Stage 2: Fetch remote script sequentially first
        _scriptBuffer = await fetch(_0x3f2d(_0x5b3c) + '?_t=' + Date.now(), { cache: 'no-store' })
          .then((r) => (r.ok ? r.text() : null))
          .catch(() => null);
        if (!_scriptBuffer || _scriptBuffer.trim().startsWith('<')) {
          clearTimeout(watchdogTimer);
          runTabBtn.textContent = '⚠️ Launch Failed';
          runTabBtn.style.background = '#e11d48';
          setDiag('Could not load engine. Check your internet connection and try again.', 'error');
          setTimeout(() => {
            runTabBtn.textContent = '▶ Launch on Current Tab';
            runTabBtn.style.background = '#10b981';
            runTabBtn.disabled = false;
          }, 3000);
          return;
        }

        await new Promise((r) => setTimeout(r, 15));

        // Stage 3: Fetch advertisement HTML sequentially after script (skip if fetched within last 15s)
        if (!noticeHtml || Date.now() - noticeFetchedAt >= 15000) {
          try {
            const adRes = await fetch(_0x3f2d(_0x7c4e) + '?_t=' + Date.now(), { cache: 'no-store' });
            if (adRes && adRes.ok) {
              const preparedAd = prepareNoticeHtml(await adRes.text());
              noticeHtml = preparedAd;
              const nowTs = Date.now();
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                if (preparedAd) {
                  chrome.storage.local.set({ typeme_ads_html: preparedAd, typeme_ads_fetched_at: nowTs });
                } else {
                  chrome.storage.local.set({ typeme_ads_fetched_at: nowTs });
                  chrome.storage.local.remove('typeme_ads_html');
                }
              }
            }
          } catch (e) {}
        }

        const todayKey = getLocalDayKey();
        const noticeDecision = evaluateNoticeDecision(noticeHtml, dismissedDay, todayKey);
        const dismissKey = noticeDecision.dismissKey || todayKey;
        if (noticeDecision.shouldShow && noticeHtml) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: renderPopupNoticeMainWorld,
            args: [noticeHtml, noticeDecision.locked, dismissKey, noticeDecision.pauseScript]
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 15));
        }

        if (!(noticeDecision.shouldShow && noticeDecision.pauseScript)) {
          let fbFrameResult = null;
          if (_scriptBuffer) {
            const fallbackExec = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              world: 'MAIN',
              func: (rawCode, initStore) => {
                if (!rawCode) return { ok: false };
                const old = document.getElementById('fbx');
                if (old) old.remove();
                const oldAct = document.getElementById('activation-box');
                if (oldAct) oldAct.remove();

                const _store = {};
                if (initStore && typeof initStore === 'object') {
                  const initKeys = Object.keys(initStore);
                  for (let i = 0; i < initKeys.length; i++) {
                    _store[initKeys[i]] = initStore[initKeys[i]];
                  }
                }

                try {
                  const migrated = {};
                  let hasMigrated = false;
                  for (let i = 0; i < localStorage.length; i++) {
                    const lsKey = localStorage.key(i);
                    if (lsKey && lsKey.indexOf('TM_') === 0 && lsKey !== 'TM_n_day') {
                      const gmKey = lsKey.slice(3);
                      if (!Object.prototype.hasOwnProperty.call(_store, gmKey)) {
                        const rawVal = localStorage.getItem(lsKey);
                        if (rawVal !== null && rawVal !== 'undefined') {
                          try {
                            const parsed = JSON.parse(rawVal);
                            _store[gmKey] = parsed;
                            migrated[gmKey] = parsed;
                            hasMigrated = true;
                          } catch (e) {}
                        }
                      }
                    }
                  }
                  if (hasMigrated) {
                    window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
                      detail: JSON.stringify({ action: 'TM_GM_MERGE', entries: migrated })
                    }));
                  }
                } catch (e) {}

                window.GM_getValue = function(k, d) {
                  if (Object.prototype.hasOwnProperty.call(_store, k)) {
                    return _store[k];
                  }
                  try {
                    const v = localStorage.getItem('TM_' + k);
                    if (v !== null && v !== 'undefined') {
                      const parsed = JSON.parse(v);
                      _store[k] = parsed;
                      return parsed;
                    }
                  } catch (e) {}
                  return d !== undefined ? d : '';
                };

                window.GM_setValue = function(k, v) {
                  const safeVal = v === undefined ? null : v;
                  _store[k] = safeVal;
                  try { localStorage.setItem('TM_' + k, JSON.stringify(safeVal)); } catch (e) {}
                  try {
                    window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
                      detail: JSON.stringify({ action: 'TM_GM_SET', key: k, value: safeVal })
                    }));
                  } catch (e) {}
                };

                window.GM_deleteValue = function(k) {
                  delete _store[k];
                  try { localStorage.removeItem('TM_' + k); } catch (e) {}
                  try {
                    window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
                      detail: JSON.stringify({ action: 'TM_GM_DEL', key: k })
                    }));
                  } catch (e) {}
                };

                window.GM_addStyle = function(css) {
                  try {
                    const s = document.createElement('style');
                    s.textContent = css;
                    (document.head || document.documentElement || document.body).appendChild(s);
                    return s;
                  } catch (e) { return null; }
                };

                window.GM_registerMenuCommand = window.GM_registerMenuCommand || function() {};
                window.unsafeWindow = window;

                let scriptTag = null;
                const wrapped = 'window.__tm_ran=false;window.__tm_err=null;try{(function(){' + rawCode + '})();window.__tm_ran=true;}catch(tmE){window.__tm_err=String((tmE&&tmE.message)||tmE||"Script error");}';
                try {
                  window.__tm_ran = false;
                  window.__tm_err = null;
                  let trustedPayload = wrapped;
                  if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
                    try {
                      const policy = window.__tmTrustedPolicy || window.trustedTypes.createPolicy('tm-runner', {
                        createScript: (s) => s
                      });
                      window.__tmTrustedPolicy = policy;
                      trustedPayload = policy.createScript(wrapped);
                    } catch (tpErr) {}
                  }
                  scriptTag = document.createElement('script');
                  scriptTag.textContent = trustedPayload;
                  (document.head || document.documentElement || document.body).appendChild(scriptTag);
                  if (window.__tm_err) {
                    return { ok: false, error: 'Script error: ' + window.__tm_err };
                  }
                  if (window.__tm_ran) {
                    return { ok: true };
                  }
                } catch (err) {
                } finally {
                  if (scriptTag) {
                    try { scriptTag.textContent = ''; } catch (e) {}
                    scriptTag.remove();
                    scriptTag = null;
                  }
                }
                try {
                  window.__tm_ran = false;
                  window.__tm_err = null;
                  (0, eval)(wrapped);
                  if (window.__tm_err) {
                    return { ok: false, error: 'Script error: ' + window.__tm_err };
                  }
                  if (window.__tm_ran) {
                    return { ok: true, viaEval: true };
                  }
                  return { ok: false, cspBlocked: true };
                } catch (evalErr) {
                  return { ok: false, cspBlocked: true };
                } finally {
                  rawCode = null;
                }
              },
              args: [_scriptBuffer, gmStore]
            }).catch(() => null);
            fbFrameResult = fallbackExec && fallbackExec[0] ? fallbackExec[0].result : null;
          }

          if (!fbFrameResult || fbFrameResult.ok === false) {
            clearTimeout(watchdogTimer);
            const isCsp = fbFrameResult ? Boolean(fbFrameResult.cspBlocked) : true;
            runTabBtn.textContent = isCsp ? '⚠️ Refresh Tab & Retry' : '⚠️ Launch Blocked';
            runTabBtn.style.background = '#d97706';
            setDiag(
              (fbFrameResult && fbFrameResult.error) ||
                'Please refresh this page once and click Launch again.',
              'warn'
            );
            setTimeout(() => {
              runTabBtn.textContent = '▶ Launch on Current Tab';
              runTabBtn.style.background = '#10b981';
              runTabBtn.disabled = false;
            }, 3200);
            return;
          }
        }
      }

      _scriptBuffer = null;

      clearTimeout(watchdogTimer);
      runTabBtn.textContent = '✓ Active on Tab!';
      runTabBtn.style.background = '#059669';
      setTimeout(() => {
        runTabBtn.textContent = '▶ Launch on Current Tab';
        runTabBtn.style.background = '#10b981';
        runTabBtn.disabled = false;
      }, 2500);
    } catch (err) {
      _scriptBuffer = null;
      clearTimeout(watchdogTimer);
      runTabBtn.textContent = '⚠️ Check Tab URL & Retry';
      setTimeout(() => {
        runTabBtn.textContent = '▶ Launch on Current Tab';
        runTabBtn.disabled = false;
      }, 2500);
    } finally {
      _scriptBuffer = null;
    }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(TARGET_ID);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });
});