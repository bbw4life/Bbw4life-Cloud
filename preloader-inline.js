(function(){
  // ══════════════════════════════════════════════════════════════
  // BBW4LIFE PRELOADER — contrôleur UNIQUE (injection + affichage +
  // animation + masquage). Auparavant, ce fichier gérait seulement
  // l'injection/le masquage pendant qu'un second bloc séparé dans
  // script.js gérait l'animation (particules/style/morph) et avait SON
  // PROPRE fetch('/products.data.json') indépendant, son propre état
  // "dismissed", et son propre appel à removeChild() sur le même DOM.
  // Deux contrôleurs non synchronisés agissant sur le même élément —
  // chacun capable de le retirer indépendamment de l'autre — est une
  // source classique de comportement instable d'un moteur de rendu à
  // l'autre (fonctionne par coïncidence de timing sur l'un, pas sur les
  // autres). Toute la logique vit maintenant ici, dans un seul endroit.
  var CACHE_KEY   = 'bbw_preloader_show';
  var VISITED_KEY = 'bbw_preloader_visited_pages';
  var injected    = false;
  var pagePath    = window.location.pathname;

  var STYLE_MAP = {
    style_pulse_logo:   'style-pulse-logo',
    style_progress_bar: 'style-progress-bar',
    style_spinner_ring: 'style-spinner-ring',
    style_dots_wave:    'style-dots-wave',
    style_morph_text:   'style-morph-text'
  };
  var MORPH_TEXTS = ['Welcome ✨', 'Beauty Has No Sizes', 'You Are Enough', 'BBW4LIFE 💖'];

  var dismissed   = false;
  var morphTimer  = null;
  var barTimer    = null;
  var morphIdx    = 0;
  var currentPct  = 0;
  var MIN_SHOW_MS = 3000;
  var startedAt   = Date.now();
  var pageReady   = false;
  var barFill     = null;
  var barPct      = null;
  var morphEl     = null;

  // ── Page déjà visitée cette session-navigateur ? ──────────
  // Le preloader n'a de sens qu'au tout premier chargement d'une page
  // (rien n'est encore en cache navigateur) — sur les visites suivantes
  // de cette même page, tout charge quasi instantanément et le réafficher
  // à chaque fois n'est que répétitif pour l'utilisateur.
  function getVisitedPages() {
    try {
      var raw = localStorage.getItem(VISITED_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function markPageVisited(path) {
    try {
      var arr = getVisitedPages();
      if (arr.indexOf(path) === -1) {
        arr.push(path);
        // Borne la taille pour éviter une croissance illimitée sur un site
        // à beaucoup de pages produit — garde les 200 plus récentes.
        if (arr.length > 200) arr = arr.slice(arr.length - 200);
        localStorage.setItem(VISITED_KEY, JSON.stringify(arr));
      }
    } catch (e) {}
  }
  var alreadyVisited = getVisitedPages().indexOf(pagePath) !== -1;

  var CSS_TEXT =
    '#cf-preloader{position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;background:linear-gradient(160deg,#F8F1E6 0%,#F6EFE5 50%,#F1E3CC 100%);opacity:1;visibility:visible;pointer-events:all;overflow:hidden;transition:opacity .55s cubic-bezier(.4,0,.2,1),visibility .55s cubic-bezier(.4,0,.2,1);}' +
    '#cf-preloader.cf-pre--hidden{opacity:0;visibility:hidden;pointer-events:none;}' +
    '#cf-preloader::before{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(ellipse at center,rgba(184,146,90,.18) 0%,rgba(110,36,57,.07) 45%,transparent 70%);pointer-events:none;animation:cfPreGlowPulse 3s ease-in-out infinite;}' +
    '@keyframes cfPreGlowPulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.7}50%{transform:translate(-50%,-50%) scale(1.2);opacity:1}}' +
    '.cf-pre-particles{position:absolute;inset:0;pointer-events:none;overflow:hidden;}' +
    '.cf-pre-particle{position:absolute;border-radius:50%;animation:cfPreParticleFloat linear infinite;opacity:0;}' +
    '@keyframes cfPreParticleFloat{0%{transform:translateY(100vh) scale(0);opacity:0}10%{opacity:.7}90%{opacity:.3}100%{transform:translateY(-10vh) scale(1);opacity:0}}' +
    '.cf-pre-logo-wrap{position:relative;display:flex;align-items:center;justify-content:center;}' +
    '.cf-pre-logo-ring{position:absolute;width:110px;height:110px;border-radius:50%;background:#15110E;border:1.5px solid rgba(184,146,90,.45);animation:cfPreRingRotate 6s linear infinite;}' +
    '.cf-pre-logo-ring::before{content:"";position:absolute;top:-3px;left:50%;width:6px;height:6px;background:#B8925A;border-radius:50%;transform:translateX(-50%);box-shadow:0 0 10px 3px rgba(184,146,90,.55);}' +
    '@keyframes cfPreRingRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
    '.cf-pre-logo{width:90px;height:90px;object-fit:contain;position:relative;z-index:1;filter:drop-shadow(0 4px 20px rgba(110,36,57,.35));animation:cfPreLogoBreath 2.5s ease-in-out infinite;}' +
    '@keyframes cfPreLogoBreath{0%,100%{transform:scale(1);filter:drop-shadow(0 4px 20px rgba(110,36,57,.35))}50%{transform:scale(1.05);filter:drop-shadow(0 6px 28px rgba(110,36,57,.55))}}' +
    '.cf-pre-brand{text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;}' +
    '.cf-pre-brand-name{font-family:"Cormorant Garamond",Georgia,serif;font-size:2.4rem;font-weight:700;letter-spacing:-.02em;line-height:1;background:linear-gradient(135deg,#15110E 20%,#B8925A 65%,#6E2439 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;opacity:0;transform:translateY(12px);animation:cfPreFadeUp .7s cubic-bezier(.34,1.56,.64,1) .25s forwards;}' +
    '.cf-pre-tagline{font-family:"DM Sans",system-ui,sans-serif;font-size:.78rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:rgba(21,17,14,.55);opacity:0;transform:translateY(8px);animation:cfPreFadeUp .6s ease .5s forwards;}' +
    '@keyframes cfPreFadeUp{to{opacity:1;transform:translateY(0)}}' +
    '.cf-pre-progress-wrap{display:none;flex-direction:column;align-items:center;gap:8px;width:260px;}' +
    '#cf-preloader.style-progress-bar .cf-pre-progress-wrap{display:flex;}' +
    '.cf-pre-progress-track{width:100%;height:3px;background:rgba(21,17,14,.10);border-radius:100px;overflow:hidden;}' +
    '.cf-pre-progress-fill{height:100%;width:0%;background:linear-gradient(90deg,#6E2439,#B8925A,#6E2439);background-size:200% 100%;border-radius:100px;transition:width .3s ease;animation:cfPreProgressShimmer 2s linear infinite;}' +
    '@keyframes cfPreProgressShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}' +
    '.cf-pre-progress-pct{font-family:"DM Sans",sans-serif;font-size:.72rem;font-weight:700;color:rgba(21,17,14,.55);letter-spacing:.1em;}' +
    '.cf-pre-spinner-wrap{display:none;position:relative;width:56px;height:56px;}' +
    '#cf-preloader.style-spinner-ring .cf-pre-spinner-wrap{display:flex;align-items:center;justify-content:center;}' +
    '.cf-pre-spinner{position:absolute;inset:0;border-radius:50%;border:2.5px solid transparent;}' +
    '.cf-pre-spinner:nth-child(1){border-top-color:#6E2439;animation:cfPreSpinCW 1s linear infinite;}' +
    '.cf-pre-spinner:nth-child(2){inset:8px;border-right-color:#B8925A;animation:cfPreSpinCCW .75s linear infinite;}' +
    '.cf-pre-spinner:nth-child(3){inset:16px;border-bottom-color:rgba(21,17,14,.35);animation:cfPreSpinCW .5s linear infinite;}' +
    '@keyframes cfPreSpinCW{to{transform:rotate(360deg)}}' +
    '@keyframes cfPreSpinCCW{to{transform:rotate(-360deg)}}' +
    '.cf-pre-dots-wrap{display:none;align-items:flex-end;gap:6px;height:28px;}' +
    '#cf-preloader.style-dots-wave .cf-pre-dots-wrap{display:flex;}' +
    '.cf-pre-dot{width:8px;height:8px;border-radius:50%;animation:cfPreDotWave 1.4s ease-in-out infinite;}' +
    '.cf-pre-dot:nth-child(1){background:#6E2439;animation-delay:0s}' +
    '.cf-pre-dot:nth-child(2){background:#9C3A52;animation-delay:.16s}' +
    '.cf-pre-dot:nth-child(3){background:#B8925A;animation-delay:.32s}' +
    '.cf-pre-dot:nth-child(4){background:#9C3A52;animation-delay:.48s}' +
    '.cf-pre-dot:nth-child(5){background:#6E2439;animation-delay:.64s}' +
    '@keyframes cfPreDotWave{0%,80%,100%{transform:scaleY(.4);opacity:.4}40%{transform:scaleY(1.4);opacity:1}}' +
    '.cf-pre-morph-wrap{display:none;position:relative;height:48px;overflow:hidden;width:90vw;max-width:420px;text-align:center;}' +
    '#cf-preloader.style-morph-text .cf-pre-morph-wrap{display:block;}' +
    '.cf-pre-morph-text{position:absolute;width:100%;font-family:"DM Sans",sans-serif;font-size:.85rem;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:rgba(21,17,14,.55);white-space:normal;word-break:break-word;line-height:1.4;padding:0 8px;box-sizing:border-box;transition:all .4s cubic-bezier(.4,0,.2,1);}' +
    '.cf-pre-morph-text.cf-morph-enter{transform:translateY(20px);opacity:0;}' +
    '.cf-pre-morph-text.cf-morph-active{transform:translateY(0);opacity:1;}' +
    '.cf-pre-morph-text.cf-morph-exit{transform:translateY(-20px);opacity:0;}' +
    '#cf-preloader.style-pulse-logo .cf-pre-logo{animation:cfPrePulseLogo 1.2s ease-in-out infinite;}' +
    '@keyframes cfPrePulseLogo{0%,100%{transform:scale(1);filter:drop-shadow(0 0 12px rgba(110,36,57,.35))}50%{transform:scale(1.15);filter:drop-shadow(0 0 32px rgba(110,36,57,.6))}}' +
    '#cf-preloader.style-pulse-logo .cf-pre-logo-ring{animation:cfPreRingPulse 1.2s ease-in-out infinite;}' +
    '@keyframes cfPreRingPulse{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.25);opacity:.9}}';

  var HTML_TEXT =
    '<div id="cf-preloader" aria-hidden="true" role="status" aria-label="Loading BBW4LIFE">' +
      '<div class="cf-pre-particles" id="cf-pre-particles"></div>' +
      '<div class="cf-pre-logo-wrap">' +
        '<div class="cf-pre-logo-ring"></div>' +
        '<img class="cf-pre-logo" src="/public/vrlogo bbw4life.png" alt="BBW4LIFE" draggable="false">' +
      '</div>' +
      '<div class="cf-pre-brand">' +
        '<span class="cf-pre-brand-name">BBW4LIFE</span>' +
        '<span class="cf-pre-tagline">Beauty Has No Sizes</span>' +
      '</div>' +
      '<div class="cf-pre-progress-wrap">' +
        '<div class="cf-pre-progress-track">' +
          '<div class="cf-pre-progress-fill" id="cf-pre-progress-fill"></div>' +
        '</div>' +
        '<span class="cf-pre-progress-pct" id="cf-pre-progress-pct">0%</span>' +
      '</div>' +
      '<div class="cf-pre-spinner-wrap">' +
        '<div class="cf-pre-spinner"></div>' +
        '<div class="cf-pre-spinner"></div>' +
        '<div class="cf-pre-spinner"></div>' +
      '</div>' +
      '<div class="cf-pre-dots-wrap">' +
        '<div class="cf-pre-dot"></div>' +
        '<div class="cf-pre-dot"></div>' +
        '<div class="cf-pre-dot"></div>' +
        '<div class="cf-pre-dot"></div>' +
        '<div class="cf-pre-dot"></div>' +
      '</div>' +
      '<div class="cf-pre-morph-wrap">' +
        '<span class="cf-pre-morph-text cf-morph-active" id="cf-pre-morph-text">Welcome ✨</span>' +
      '</div>' +
    '</div>';

  function injectPreloader() {
    if (injected) return;
    injected = true;
    var s = document.createElement('style');
    s.id = 'cf-pre-style';
    s.textContent = CSS_TEXT;
    document.head.appendChild(s);
    document.documentElement.insertAdjacentHTML('afterbegin', HTML_TEXT);
  }

  function removePreloader() {
    dismissed = true;
    clearInterval(barTimer);
    clearInterval(morphTimer);
    var el = document.getElementById('cf-preloader');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    var st = document.getElementById('cf-pre-style');
    if (st && st.parentNode) st.parentNode.removeChild(st);
  }

  function spawnParticles() {
    var container = document.getElementById('cf-pre-particles');
    if (!container) return;
    var colors = [
      'rgba(110,36,57,0.5)',
      'rgba(184,146,90,0.5)',
      'rgba(156,58,82,0.45)',
      'rgba(21,17,14,0.12)'
    ];
    for (var i = 0; i < 22; i++) {
      var p        = document.createElement('div');
      p.className  = 'cf-pre-particle';
      var size     = Math.random() * 5 + 3;
      var left     = Math.random() * 100;
      var duration = Math.random() * 6 + 5;
      var delay    = Math.random() * 8;
      var color    = colors[Math.floor(Math.random() * colors.length)];
      p.style.cssText =
        'width:' + size + 'px;height:' + size + 'px;' +
        'left:' + left + '%;' +
        'background:' + color + ';' +
        'animation-duration:' + duration + 's;' +
        'animation-delay:' + delay + 's;';
      container.appendChild(p);
    }
  }

  function applyStyle(pl, key) {
    var cssClass = STYLE_MAP[key] || STYLE_MAP.style_dots_wave;
    Object.keys(STYLE_MAP).forEach(function (k) { pl.classList.remove(STYLE_MAP[k]); });
    pl.classList.add(cssClass);

    if (cssClass === 'style-progress-bar' && barFill && barPct) {
      barTimer = setInterval(function () {
        var step = currentPct < 70 ? 3 : currentPct < 90 ? 1 : 0.4;
        currentPct = Math.min(95, currentPct + step);
        barFill.style.width = currentPct + '%';
        barPct.textContent  = Math.floor(currentPct) + '%';
      }, 80);
    }

    if (cssClass === 'style-morph-text' && morphEl) {
      morphEl.textContent = MORPH_TEXTS[0];
      morphEl.className   = 'cf-pre-morph-text cf-morph-active';
      morphTimer = setInterval(function () {
        morphIdx = (morphIdx + 1) % MORPH_TEXTS.length;
        morphEl.className = 'cf-pre-morph-text cf-morph-exit';
        setTimeout(function () {
          morphEl.textContent = MORPH_TEXTS[morphIdx];
          morphEl.className   = 'cf-pre-morph-text cf-morph-enter';
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              morphEl.className = 'cf-pre-morph-text cf-morph-active';
            });
          });
        }, 420);
      }, 1600);
    }
  }

  function tryHide() {
    if (dismissed) return;
    var elapsed = Date.now() - startedAt;
    var delay   = Math.max(0, MIN_SHOW_MS - elapsed);
    setTimeout(doHide, delay);
  }

  function doHide() {
    if (dismissed) return;
    var pl = document.getElementById('cf-preloader');
    if (!pl) { dismissed = true; return; }
    dismissed = true;
    clearInterval(barTimer);
    clearInterval(morphTimer);

    if (barFill) {
      barFill.style.width = '100%';
      if (barPct) barPct.textContent = '100%';
    }

    var isProgress = pl.classList.contains('style-progress-bar');
    setTimeout(function () {
      pl.classList.add('cf-pre--hidden');
      setTimeout(function () {
        if (pl && pl.parentNode) pl.parentNode.removeChild(pl);
        var st = document.getElementById('cf-pre-style');
        if (st && st.parentNode) st.parentNode.removeChild(st);
      }, 600);
    }, isProgress ? 350 : 0);
  }

  // ── Fast-path synchrone ───────────────────────────────────
  // Le preloader s'affiche au tout premier chargement d'une page (aucune
  // exception tolérée là) — mais pas lors des visites suivantes de cette
  // même page, où tout charge déjà quasi instantanément et le réafficher
  // ne serait que répétitif. On l'injecte donc immédiatement sauf si :
  //  - une visite précédente a confirmé qu'il était désactivé (cached==='no')
  //  - ou cette page précise a déjà été visitée (alreadyVisited)
  var cached = null;
  try { cached = localStorage.getItem(CACHE_KEY); } catch (e) {}
  if (cached !== 'no' && !alreadyVisited) injectPreloader();
  markPageVisited(pagePath);

  if (alreadyVisited) dismissed = true;

  // Filet de sécurité ABSOLU : quoi qu'il arrive (fetch lent, en échec,
  // navigateur qui bloque le réseau), le preloader ne reste jamais
  // affiché plus de 8s.
  setTimeout(doHide, 8000);

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    pageReady = true;
  } else {
    document.addEventListener('DOMContentLoaded', function () { pageReady = true; });
  }

  // ── Confirmation asynchrone (source de vérité pour show/style) ───
  fetch('/products.data.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var arr      = Array.isArray(data) ? data : [];
      var settings = arr.find(function(p){ return p.type === 'settings'; }) || {};
      var cfg      = settings.preloader || {};
      var show     = (cfg.show || 'yes').trim().toLowerCase();

      try { localStorage.setItem(CACHE_KEY, show === 'yes' ? 'yes' : 'no'); } catch (e) {}

      if (show !== 'yes' || alreadyVisited) {
        removePreloader();
        return;
      }

      injectPreloader(); // no-op si déjà injecté via le cache ci-dessus
      var pl = document.getElementById('cf-preloader');
      if (!pl || dismissed) return;

      barFill = document.getElementById('cf-pre-progress-fill');
      barPct  = document.getElementById('cf-pre-progress-pct');
      morphEl = document.getElementById('cf-pre-morph-text');

      spawnParticles();

      var activeKey = Object.keys(STYLE_MAP).find(function (k) {
        return (cfg[k] || 'no').trim().toLowerCase() === 'yes';
      }) || 'style_dots_wave';

      applyStyle(pl, activeKey);

      if (pageReady) {
        tryHide();
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          pageReady = true;
          tryHide();
        });
      }
    })
    .catch(function () {
      // Même en cas d'échec du fetch, respecte le MIN_SHOW_MS via tryHide
      // plutôt que de laisser uniquement le filet de sécurité à 8s trancher.
      if (pageReady) tryHide();
      else document.addEventListener('DOMContentLoaded', function () { pageReady = true; tryHide(); });
    });

  // ── Retour arrière via bfcache ────────────────────────────
  // Si l'utilisateur navigue ailleurs pendant que le preloader est encore
  // visible puis revient en arrière, certains navigateurs restaurent la
  // page depuis le bfcache (event.persisted===true) sans réexécuter ce
  // script — le DOM figé au moment du départ (preloader encore présent)
  // réapparaît tel quel. On le retire immédiatement dans ce cas précis.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) removePreloader();
  });
})();
