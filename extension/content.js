(function() {
  function _exec(rawScript, initStore, forceManual) {
    if (!rawScript || typeof rawScript !== 'string') {
      rawScript = null;
      return;
    }
    const oldFbx = document.getElementById('fbx');
    const oldAct = document.getElementById('activation-box');
    if (oldFbx || oldAct) {
      if (!forceManual) {
        rawScript = null;
        return;
      }
      if (oldFbx) oldFbx.remove();
      if (oldAct) oldAct.remove();
    }

    const safeInitStore = JSON.stringify(initStore && typeof initStore === 'object' ? initStore : {}).replace(/</g, '\\u003c');

    let fullExecutable = `
      (function() {
        const _store = ${safeInitStore};

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

        window.GM_getValue = function(key, defaultValue) {
          if (Object.prototype.hasOwnProperty.call(_store, key)) {
            return _store[key];
          }
          try {
            const val = localStorage.getItem('TM_' + key);
            if (val !== null && val !== 'undefined') {
              const parsed = JSON.parse(val);
              _store[key] = parsed;
              return parsed;
            }
          } catch (e) {}
          return defaultValue !== undefined ? defaultValue : '';
        };

        window.GM_setValue = function(key, value) {
          const safeVal = value === undefined ? null : value;
          _store[key] = safeVal;
          try {
            localStorage.setItem('TM_' + key, JSON.stringify(safeVal));
          } catch (e) {}
          try {
            window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
              detail: JSON.stringify({ action: 'TM_GM_SET', key: key, value: safeVal })
            }));
          } catch (e) {}
        };

        window.GM_deleteValue = function(key) {
          delete _store[key];
          try {
            localStorage.removeItem('TM_' + key);
          } catch (e) {}
          try {
            window.dispatchEvent(new CustomEvent('__tm_ext_sync', {
              detail: JSON.stringify({ action: 'TM_GM_DEL', key: key })
            }));
          } catch (e) {}
        };

        window.GM_addStyle = function(css) {
          try {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement || document.body).appendChild(style);
            return style;
          } catch (e) {
            return null;
          }
        };

        window.GM_registerMenuCommand = window.GM_registerMenuCommand || function() {};
        window.unsafeWindow = window;

        try {
          ${rawScript}
        } catch(err) {}
      })();
    `;
    rawScript = null;

    function doInject() {
      let scriptEl = null;
      try {
        let trustedPayload = fullExecutable;
        if (window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
          try {
            const policy = window.__tmTrustedPolicy || window.trustedTypes.createPolicy('tm-runner', {
              createScript: (s) => s
            });
            window.__tmTrustedPolicy = policy;
            trustedPayload = policy.createScript(fullExecutable);
          } catch (tpErr) {}
        }
        scriptEl = document.createElement('script');
        scriptEl.textContent = trustedPayload;
        (document.head || document.documentElement || document.body).appendChild(scriptEl);
      } catch (e) {
      } finally {
        if (scriptEl) {
          try { scriptEl.textContent = ''; } catch (e2) {}
          scriptEl.remove();
          scriptEl = null;
        }
        fullExecutable = null;
      }
    }

    if (!document.body) {
      window.addEventListener('DOMContentLoaded', doInject);
    } else {
      doInject();
    }
  }

  function _renderNotice(notice) {
    if (!notice || !notice.shouldShow || !notice.html || document.getElementById('tm-notice-host')) {
      return;
    }
    if (window.top !== window.self) return;
    if (!notice.locked) {
      try {
        if (localStorage.getItem('TM_n_day') === notice.dayKey) return;
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

    const isFullDoc = /<(?:!doctype|html|head|body)\b/i.test(notice.html) || /position\s*:\s*fixed|min-height\s*:\s*100vh/i.test(notice.html);

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
      } else if (d.__tmAdFrame === 'close' && !notice.locked) {
        dismissNow();
      }
    }

    window.addEventListener('message', onFrameMessage);

    function dismissNow(ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (notice.locked || closed) return;
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
      try { localStorage.setItem('TM_n_day', notice.dayKey); } catch (e) {}
      try {
        chrome.runtime.sendMessage({
          type: 'DISMISS_NOTICE_TODAY',
          dayKey: notice.dayKey,
          resumePaused: Boolean(notice.pauseScript)
        });
      } catch (e) {}
      try { host.remove(); } catch (e) {}
    }

    if (!notice.locked) {
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

      const safeHtml = stripUnsafeForShadow(notice.html);
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

      if (!notice.locked) {
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
      adIframe.srcdoc = toTrustedHtml(buildSrcdocHtml(notice.html));
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

    if (notice.locked && typeof MutationObserver !== 'undefined') {
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

  function forwardExtAction(data) {
    if (!data || !data.action) return;
    try {
      if (data.action === 'TM_DISMISS_NOTICE') {
        chrome.runtime.sendMessage({
          type: 'DISMISS_NOTICE_TODAY',
          dayKey: data.dayKey,
          resumePaused: Boolean(data.resumePaused)
        });
      } else if (data.action === 'TM_GM_SET') {
        chrome.runtime.sendMessage({
          type: 'TM_GM_SET',
          key: data.key,
          value: data.value
        });
      } else if (data.action === 'TM_GM_DEL') {
        chrome.runtime.sendMessage({
          type: 'TM_GM_DEL',
          key: data.key
        });
      } else if (data.action === 'TM_GM_MERGE') {
        chrome.runtime.sendMessage({
          type: 'TM_GM_MERGE',
          entries: data.entries
        });
      }
    } catch (e) {}
  }

  window.addEventListener('__tm_ext_sync', (event) => {
    try {
      const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      forwardExtAction(data);
    } catch (e) {}
  });

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.__tmAction !== 'TM_DISMISS_NOTICE') {
      return;
    }
    forwardExtAction({
      action: 'TM_DISMISS_NOTICE',
      dayKey: event.data.dayKey,
      resumePaused: Boolean(event.data.resumePaused)
    });
  });

  function _tmMurmur3(str, seed) {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }

  function _computeWindowDeviceId() {
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
    const h1 = _tmMurmur3(rawFingerprint, 0x13579BDF);
    const h2 = _tmMurmur3(rawFingerprint, 0x2468ACE0);
    return 'TM-' + h1.slice(0, 4) + '-' + h1.slice(4, 8) + '-' + h2.slice(0, 4);
  }

  let _startedOnce = false;

  function start() {
    if (_startedOnce) return;
    const href = (location.href || '').toLowerCase();
    if (!href.includes('facebook.com') && !href.includes('fb.com') && !href.includes('signup')) {
      return;
    }
    _startedOnce = true;

    setTimeout(() => {
      let winId = null;
      try {
        winId = _computeWindowDeviceId();
      } catch (e) {}

      chrome.runtime.sendMessage({ type: 'REQUEST_TAB_INJECT', deviceId: winId }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          _startedOnce = false;
          return;
        }
        // Background worker handles sequential ID check -> script -> ad HTML in MAIN world
        if (response && response.ok === false && response.error && !response.skipped) {
          _startedOnce = false;
        }
      });
    }, 15);
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === 'SHOW_NOTICE_NOW') {
      if (req.notice) _renderNotice(req.notice);
      sendResponse({ status: 'ok', success: true });
    } else if (req.type === 'INJECT_NOW') {
      if (req.script) {
        let s = req.script;
        req.script = null;
        _exec(s, req.gmStore, Boolean(req.forceManual));
        s = null;
      } else {
        _startedOnce = false;
        start();
      }
      sendResponse({ status: 'ok', success: true });
    }
    return true;
  });

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();