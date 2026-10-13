/*!
 * luot-xem.js — ghi lại lượt truy cập (thiết bị + vị trí) và gửi về Google Apps Script.
 * (Không đặt tên tracker.js/analytics.js: trình chặn quảng cáo hay chặn các tên đó.)
 *
 * Nhúng vào cuối <body> của mọi trang:
 *   <script src="luot-xem.js" data-endpoint="https://script.google.com/macros/s/XXXX/exec" defer></script>
 *
 * Tuỳ chọn (thuộc tính trên thẻ script):
 *   data-full-ip="true"   lưu đủ địa chỉ IP (mặc định che phần cuối, vd 113.161.45.0)
 *   data-respect-dnt="true"  bỏ qua người dùng bật "Do Not Track"
 *
 * Không đếm chính bạn: mở trang của bạn một lần với ?notrack=1 (bật lại bằng ?notrack=0).
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute('data-endpoint')) || window.TRACKER_ENDPOINT;
  var FULL_IP = script && script.getAttribute('data-full-ip') === 'true';
  var RESPECT_DNT = script && script.getAttribute('data-respect-dnt') === 'true';
  var SESSION_TIMEOUT = 30 * 60 * 1000;

  if (!ENDPOINT) return console.warn('[tracker] Thiếu data-endpoint.');

  var store = {
    get: function (s, k) { try { return window[s].getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { window[s].setItem(k, v); } catch (e) {} },
    del: function (s, k) { try { window[s].removeItem(k); } catch (e) {} }
  };

  var notrack = new URLSearchParams(location.search).get('notrack');
  if (notrack === '1') store.set('localStorage', 'tk_ignore', '1');
  if (notrack === '0') store.del('localStorage', 'tk_ignore');
  if (store.get('localStorage', 'tk_ignore') === '1') return;

  var ua = navigator.userAgent || '';
  if (navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit/i.test(ua)) return;
  if (RESPECT_DNT && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) return;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  // ---------- Người truy cập & phiên ----------
  var visitorId = store.get('localStorage', 'tk_vid');
  var isNewVisitor = !visitorId;
  if (!visitorId) { visitorId = uid(); store.set('localStorage', 'tk_vid', visitorId); }

  function getSession() {
    var now = Date.now();
    var s = null;
    try { s = JSON.parse(store.get('localStorage', 'tk_sess')); } catch (e) {}
    var isNew = !s || !s.id || now - s.last > SESSION_TIMEOUT;
    if (isNew) s = { id: uid() };
    s.last = now;
    store.set('localStorage', 'tk_sess', JSON.stringify(s));
    return { id: s.id, isNew: isNew };
  }

  // ---------- Thiết bị ----------
  function match(re) { var m = ua.match(re); return m ? m[1] : ''; }

  function parseBrowser() {
    var rules = [
      ['Zalo', /Zalo(?: ?(?:android|iOS))?\/([\d.]+)/i],
      ['Facebook', /FBAV\/([\d.]+)/],
      ['Instagram', /Instagram ([\d.]+)/],
      ['TikTok', /(?:musical_ly|TikTok)[_\/]([\d.]+)/i],
      ['Cốc Cốc', /coc_coc_browser\/([\d.]+)/],
      ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
      ['Opera', /(?:OPR|Opera|OPiOS)\/([\d.]+)/],
      ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
      ['UC Browser', /UCBrowser\/([\d.]+)/],
      ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+).*Safari/]
    ];
    for (var i = 0; i < rules.length; i++) {
      var v = match(rules[i][1]);
      if (v) return { name: rules[i][0], version: v.split('.').slice(0, 2).join('.') };
    }
    return { name: 'Khác', version: '' };
  }

  var isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;

  function parseOS() {
    if (/Windows NT/.test(ua)) {
      var nt = match(/Windows NT ([\d.]+)/);
      var map = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' };
      return { name: 'Windows', version: map[nt] || nt };
    }
    // iPad đời mới gửi UA giống Mac; khi đó lấy phiên bản Safari (đi cùng phiên bản iPadOS).
    if (/iPad/.test(ua) || isIPadOS) return { name: 'iPadOS', version: (match(/OS (\d+[_.]\d+)/) || match(/Version\/(\d+\.\d+)/)).replace('_', '.') };
    if (/iPhone|iPod/.test(ua)) return { name: 'iOS', version: match(/OS (\d+[_.]\d+)/).replace('_', '.') };
    if (/Android/.test(ua)) return { name: 'Android', version: match(/Android ([\d.]+)/) };
    if (/CrOS/.test(ua)) return { name: 'ChromeOS', version: '' };
    if (/Mac OS X/.test(ua)) return { name: 'macOS', version: match(/Mac OS X (\d+[_.]\d+)/).replace('_', '.') };
    if (/Linux/.test(ua)) return { name: 'Linux', version: '' };
    return { name: 'Khác', version: '' };
  }

  function parseDeviceType() {
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || isIPadOS || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function parseModel() {
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || isIPadOS) return 'iPad';
    var m = match(/Android [\d.]+;(?: [a-z]{2}[-_][a-z]{2};)? ([^;)]+?)(?: Build|\))/i);
    return m && m !== 'K' ? m.trim() : '';
  }

  function vendorOf(model, os) {
    if (os === 'iOS' || os === 'iPadOS' || os === 'macOS') return 'Apple';
    var rules = [
      [/^SM-|Galaxy|Samsung/i, 'Samsung'], [/Pixel/i, 'Google'], [/Redmi|POCO|Xiaomi|^M\d{4}|^2\d{3}[A-Z0-9]{4,}/i, 'Xiaomi'],
      [/^CPH|OPPO/i, 'OPPO'], [/^RMX|realme/i, 'realme'], [/vivo|^V\d{4}/i, 'vivo'], [/HUAWEI|^[A-Z]{3}-[A-Z]?L\d/i, 'Huawei'],
      [/Nokia/i, 'Nokia'], [/^XQ-|Sony/i, 'Sony'], [/OnePlus|^[A-Z]{2}\d{4}$/i, 'OnePlus'], [/moto/i, 'Motorola'], [/Vsmart/i, 'Vsmart']
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(model)) return rules[i][1];
    return '';
  }

  function collectDevice() {
    var b = parseBrowser(), os = parseOS();
    var d = {
      deviceType: parseDeviceType(),
      deviceModel: parseModel(),
      browser: b.name, browserVersion: b.version,
      os: os.name, osVersion: os.version,
      screen: screen.width + 'x' + screen.height,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      pixelRatio: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      language: navigator.language || '',
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      touch: navigator.maxTouchPoints > 0,
      cpuCores: navigator.hardwareConcurrency || '',
      memoryGB: navigator.deviceMemory || '',
      connection: (navigator.connection && navigator.connection.effectiveType) || '',
      userAgent: ua
    };
    // Trình duyệt Chromium cho biết model thật và phân biệt Windows 10/11.
    var uad = navigator.userAgentData;
    var done = Promise.resolve(d);
    if (uad && uad.getHighEntropyValues) {
      done = uad.getHighEntropyValues(['model', 'platformVersion']).then(function (h) {
        if (h.model) d.deviceModel = h.model;
        if (d.os === 'Windows' && h.platformVersion) d.osVersion = parseInt(h.platformVersion, 10) >= 13 ? '11' : '10';
        return d;
      }, function () { return d; });
    }
    return done.then(function (d) { d.deviceVendor = vendorOf(d.deviceModel, d.os); return d; });
  }

  // ---------- Vị trí (theo IP) ----------
  function maskIP(ip) {
    if (!ip || FULL_IP) return ip || '';
    if (ip.indexOf(':') >= 0) return ip.split(':').slice(0, 3).join(':') + '::';
    return ip.replace(/\.\d+$/, '.0');
  }

  function getJSON(url, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl && ctrl.signal }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  function collectGeo() {
    var cached = store.get('sessionStorage', 'tk_geo');
    if (cached) { try { return Promise.resolve(JSON.parse(cached)); } catch (e) {} }

    return getJSON('https://get.geojs.io/v1/ip/geo.json', 4000).then(function (g) {
      return {
        ip: g.ip, country: g.country, countryCode: g.country_code, region: g.region, city: g.city,
        lat: parseFloat(g.latitude), lon: parseFloat(g.longitude), isp: g.organization_name || g.organization
      };
    }).catch(function () {
      return getJSON('https://ipapi.co/json/', 4000).then(function (g) {
        return {
          ip: g.ip, country: g.country_name, countryCode: g.country_code, region: g.region, city: g.city,
          lat: g.latitude, lon: g.longitude, isp: g.org
        };
      });
    }).then(function (geo) {
      geo.ip = maskIP(geo.ip);
      if (isNaN(geo.lat)) geo.lat = '';
      if (isNaN(geo.lon)) geo.lon = '';
      store.set('sessionStorage', 'tk_geo', JSON.stringify(geo));
      return geo;
    }).catch(function () { return {}; });
  }

  // ---------- Gửi ----------
  function send(payload) {
    var body = JSON.stringify(payload);
    // text/plain là "simple request": không bị CORS preflight, Apps Script vẫn đọc được.
    if (window.fetch) {
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, body: body })
        .catch(function () { navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body); });
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, body);
    }
  }

  function referrerInfo() {
    var ref = document.referrer || '';
    var host = '';
    try { host = ref ? new URL(ref).hostname : ''; } catch (e) {}
    if (host === location.hostname) host = ''; // điều hướng nội bộ không tính là nguồn
    return { referrer: host ? ref : '', referrerHost: host };
  }

  var lastKey = null;
  var devicePromise = collectDevice();
  var geoPromise = collectGeo();
  var firstHit = true;

  function track() {
    // "#/gioi-thieu" (hash router) là một trang riêng; "#muc-2" (neo trong trang) thì không.
    var route = /^#!?\//.test(location.hash) ? location.hash : '';
    var key = location.pathname + location.search + route;
    if (key === lastKey) return;
    lastKey = key;

    var session = getSession();
    var q = new URLSearchParams(location.search);
    var ref = firstHit ? referrerInfo() : { referrer: '', referrerHost: '' };
    var base = {
      visitorId: visitorId,
      sessionId: session.id,
      isNewVisitor: isNewVisitor && firstHit,
      isNewSession: session.isNew,
      url: location.href,
      path: location.pathname + route,
      title: document.title,
      referrer: ref.referrer,
      referrerHost: ref.referrerHost,
      utmSource: q.get('utm_source') || '',
      utmMedium: q.get('utm_medium') || '',
      utmCampaign: q.get('utm_campaign') || ''
    };
    firstHit = false;

    Promise.all([devicePromise, geoPromise]).then(function (r) {
      var payload = {};
      [base, r[0], r[1]].forEach(function (o) { for (var k in o) payload[k] = o[k]; });
      send(payload);
    });
  }

  // Hỗ trợ trang một-trang (SPA) đổi đường dẫn bằng history.pushState hoặc hash router.
  var push = history.pushState;
  history.pushState = function () { var r = push.apply(this, arguments); setTimeout(track, 0); return r; };
  window.addEventListener('popstate', track);
  window.addEventListener('hashchange', track);

  track();
})();

