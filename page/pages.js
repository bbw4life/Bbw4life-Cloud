/* ═══════════════════════════════════════════════════
   JS À AJOUTER DANS pages.js — Our Story Page
   ═══════════════════════════════════════════════════ */
function initOurStoryPage() {
  if (!document.querySelector('.os-origin-section')) return;

  osInitReveal();
  osInitParticles();
  osInitTrustBannerKenBurns();
  osInitCounterAnim();
}

/* ─────────────────────────────────────────────────────
   1. SCROLL REVEAL — IntersectionObserver
───────────────────────────────────────────────────── */
function osInitReveal() {
  const els = document.querySelectorAll('[data-os-reveal]');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // délai cascadé par index dans le parent
        const siblings = [...entry.target.parentElement.querySelectorAll('[data-os-reveal]')];
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('os-revealed');
        }, idx * 120);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => observer.observe(el));
}

/* ─────────────────────────────────────────────────────
   2. PARTICLES — Section Turning Point
───────────────────────────────────────────────────── */
function osInitParticles() {
  const container = document.getElementById('osTurningParticles');
  if (!container) return;

  const colors = [
    'rgba(192,56,94,0.55)',
    'rgba(201,150,62,0.50)',
    'rgba(212,80,110,0.45)',
    'rgba(232,188,106,0.50)',
    'rgba(123,63,110,0.45)',
    'rgba(255,255,255,0.25)'
  ];

  function createParticle() {
    const p = document.createElement('span');
    const size = Math.random() * 5 + 2;
    const x = Math.random() * 100;
    const duration = Math.random() * 8 + 5;
    const delay = Math.random() * 4;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const drift = (Math.random() - 0.5) * 80;

    p.style.cssText = `
      position: absolute;
      left: ${x}%;
      bottom: -10px;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${color};
      pointer-events: none;
      animation: osPtclFloat ${duration}s ${delay}s ease-in-out infinite;
      --drift: ${drift}px;
    `;
    container.appendChild(p);
  }

  // Injecter le keyframe dynamique
  if (!document.getElementById('os-ptcl-style')) {
    const style = document.createElement('style');
    style.id = 'os-ptcl-style';
    style.textContent = `
      @keyframes osPtclFloat {
        0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
        15%  { opacity: 1; }
        85%  { opacity: 0.5; }
        100% { transform: translateY(-120px) translateX(var(--drift)) scale(0.4); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  for (let i = 0; i < 22; i++) createParticle();
}

/* ─────────────────────────────────────────────────────
   3. TRUST BANNER — Ken Burns photo zoom
───────────────────────────────────────────────────── */
function osInitTrustBannerKenBurns() {
  const photo = document.querySelector('.trust-banner-photo');
  if (!photo) return;

  // Léger mouvement parallaxe au scroll
  function onScroll() {
    const rect = photo.closest('.trust-banner-wrap');
    if (!rect) return;
    const wrapRect = rect.getBoundingClientRect();
    const progress = -wrapRect.top / (window.innerHeight + wrapRect.height);
    const y = Math.max(-15, Math.min(15, progress * 40));
    photo.style.transform = `scale(1.08) translateY(${y}px)`;
  }

  // Ken Burns initial animation
  photo.style.transition = 'transform 12s ease-out';
  photo.style.transform = 'scale(1.08) translateY(0)';

  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ─────────────────────────────────────────────────────
   4. COUNTER ANIMATION — Stats row
───────────────────────────────────────────────────── */
function osInitCounterAnim() {
  const statNums = document.querySelectorAll('.os-stat-num');
  if (!statNums.length) return;

  function animateCounter(el) {
    const raw = el.textContent.trim();
    // Extraire nombre et suffixe (ex: "12,000+" → 12000, "+")
    const numMatch = raw.replace(/,/g, '').match(/^[\d.]+/);
    if (!numMatch) return;

    const target = parseFloat(numMatch[0]);
    const suffix = raw.replace(/^[\d,\.]+/, '');
    const isFloat = raw.includes('.');
    const decimals = isFloat ? (raw.split('.')[1] || '').replace(/[^0-9]/g,'').length : 0;
    const duration = 1600;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (isFloat) {
        el.textContent = current.toFixed(decimals) + suffix;
      } else {
        // Format avec virgule si > 999
        const int = Math.floor(current);
        el.textContent = (int >= 1000 ? int.toLocaleString('en-US') : int) + suffix;
      }

      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNums.forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', initOurStoryPage);









/* ═══════════════════════════════════════════════════════════════════
   BBW4LIFE — ABOUT US — pages.js script
   Scroll reveal · Counter animation · Mission particles
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ──────────────────────────────────────
     1. SCROLL REVEAL
  ────────────────────────────────────── */
  function initAuReveal() {
    const els = document.querySelectorAll('[data-au-reveal]');
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('au-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ──────────────────────────────────────
     2. COUNTER ANIMATION
  ────────────────────────────────────── */
  function animateCounter(el, target, isDecimal, duration) {
    let start = null;
    const startVal = 0;

    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const val = startVal + (target - startVal) * ease;
      el.textContent = isDecimal ? val.toFixed(1) : Math.floor(val).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = isDecimal ? target.toFixed(1) : Math.floor(target).toLocaleString();
    }
    requestAnimationFrame(step);
  }

  

function initAuCounters() {
  function run() {
    const s = (window.__allProducts || []).find(p => p.type === 'settings');
    const stats = s ? (s.site_stats || {}) : {};

    // 1. Injecter data-target depuis le JSON pour les cartes dynamiques
    document.querySelectorAll('.au-nc-num[data-stat-key]').forEach(el => {
      const key = el.getAttribute('data-stat-key');
      if (stats[key] !== undefined) el.setAttribute('data-target', stats[key]);
    });

    // 2. Animer TOUS les .au-nc-num qui ont un data-target (dynamiques + statiques)
    const nums = document.querySelectorAll('.au-nc-num[data-target]');
    if (!nums.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = parseFloat(el.dataset.target);
          const isDecimal = el.dataset.decimal === 'true';
          animateCounter(el, target, isDecimal, 2000);
          observer.unobserve(el);
        });
      },
      { threshold: 0.50 }
    );

    nums.forEach((el) => observer.observe(el));
  }

  if (window.__allProducts && window.__allProducts.length) {
    run();
  } else {
    let tries = 0;
    const wait = setInterval(() => {
      if (window.__allProducts && window.__allProducts.length) {
        clearInterval(wait);
        run();
      } else if (++tries > 60) clearInterval(wait);
    }, 100);
  }
}



  /* ──────────────────────────────────────
     3. MISSION PARTICLES
  ────────────────────────────────────── */
  function initAuMissionParticles() {
    const container = document.getElementById('auMissionParticles');
    if (!container) return;

    const colors = [
      'rgba(201,150,62,0.65)',
      'rgba(232,188,106,0.50)',
      'rgba(192,56,94,0.45)',
      'rgba(123,63,110,0.45)',
      'rgba(255,255,255,0.30)',
    ];

    function createParticle() {
      const p = document.createElement('span');
      p.className = 'au-mq-particle';
      const size = Math.random() * 5 + 2;
      const leftPct = Math.random() * 100;
      const duration = Math.random() * 8 + 5;
      const delay = Math.random() * 6;
      const color = colors[Math.floor(Math.random() * colors.length)];

      Object.assign(p.style, {
        width: size + 'px',
        height: size + 'px',
        left: leftPct + '%',
        bottom: '0',
        background: color,
        animationDuration: duration + 's',
        animationDelay: delay + 's',
        filter: 'blur(' + (size > 4 ? '1px' : '0px') + ')',
      });

      container.appendChild(p);
      // Remove after animation ends to avoid DOM bloat
      setTimeout(() => p.remove(), (duration + delay) * 1000 + 500);
    }

    // Spawn particles continuously
    let interval = setInterval(createParticle, 450);

    // Pause when section out of view
    const section = document.querySelector('.au-mission-section');
    if (section) {
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          if (!interval) interval = setInterval(createParticle, 450);
        } else {
          clearInterval(interval);
          interval = null;
        }
      }, { threshold: 0.05 });
      obs.observe(section);
    }
  }

  /* ──────────────────────────────────────
     4. HERO PARALLAX (subtle)
  ────────────────────────────────────── */
  function initAuHeroParallax() {
    const orbs = document.querySelectorAll('.au-hero-orb');
    const lines = document.querySelectorAll('.au-hl');
    if (!orbs.length) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        orbs.forEach((orb, i) => {
          const factor = i === 0 ? 0.08 : i === 1 ? 0.05 : 0.12;
          orb.style.transform = `translateY(${y * factor}px)`;
        });
        lines.forEach((line, i) => {
          const f = (i + 1) * 0.04;
          line.style.transform = `translate(-50%,-50%) scale(${1 + y * f * 0.0003})`;
        });
        ticking = false;
      });
    }, { passive: true });
  }

  /* ──────────────────────────────────────
     5. OFFER CARDS HOVER TILT
  ────────────────────────────────────── */
  function initAuCardTilt() {
    document.querySelectorAll('.au-offer-card, .au-value-item, .au-num-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        card.style.transform = `translateY(-6px) rotateX(${-dy * 4}deg) rotateY(${dx * 4}deg)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        setTimeout(() => (card.style.transition = ''), 500);
      });
    });
  }

  /* ──────────────────────────────────────
     6. MARQUEE DUPLICATION
  ────────────────────────────────────── */
  function initAuMarquees() {
    document.querySelectorAll('.au-marquee-inner').forEach((inner) => {
      // Clone content for seamless loop if not already done
      if (!inner.dataset.duped) {
        inner.innerHTML += inner.innerHTML;
        inner.dataset.duped = '1';
      }
    });
  }

  /* ──────────────────────────────────────
     INIT ALL
  ────────────────────────────────────── */
  function initAboutPage() {
    // Only run on pages that have the about sections
    if (!document.querySelector('.au-hero-section, .au-who-section')) return;

    initAuReveal();
    initAuCounters();
    initAuMissionParticles();
    initAuHeroParallax();
    initAuCardTilt();
    initAuMarquees();
  }

  // Run on DOMContentLoaded or immediately if already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutPage);
  } else {
    initAboutPage();
  }

})();




/* ═══════════════════════════════════════════════════════════════
   BBW4LIFE — DISCLAIMER PAGE JS
   disclaimer.js
═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  
  const bg = document.getElementById('discHeartsBg');
  if (bg) {
    const hearts = ['♥', '❤', '♡'];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('span');
      el.className = 'disc-heart-float';
      el.textContent = hearts[Math.floor(Math.random() * hearts.length)];
      const size = 8 + Math.random() * 14;
      el.style.cssText = `
        left: ${Math.random() * 100}%;
        bottom: -20px;
        font-size: ${size}px;
        animation-duration: ${14 + Math.random() * 20}s;
        animation-delay: ${Math.random() * 18}s;
        opacity: 0;
        color: ${Math.random() > 0.5
          ? 'rgba(192,56,94,0.18)'
          : 'rgba(201,150,62,0.14)'};
      `;
      bg.appendChild(el);
    }
  }

  
  const cards = document.querySelectorAll('.disc-card');
  if (cards.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = Array.from(cards).indexOf(entry.target);
          setTimeout(() => {
            entry.target.classList.add('disc-card--visible');
          }, idx * 80);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    cards.forEach(card => observer.observe(card));
  }

  
  const sectionIds = [
    'disc-mission',
    'disc-products',
    'disc-brand',
    'disc-style',
    'disc-legal',
    'disc-ip',
    'disc-changes'
  ];
  const tocLinks = document.querySelectorAll('.disc-toc-list li a');

  const updateActiveToc = () => {
    let current = '';
    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 140) current = id;
    });
    tocLinks.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === '#' + current) {
        a.classList.add('active');
      }
    });
  };

  window.addEventListener('scroll', updateActiveToc, { passive: true });
  updateActiveToc(); // run once on load

  
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        window.scrollTo({
          top: target.offsetTop - 110,
          behavior: 'smooth'
        });
      }
    });
  });

});




// ====================== CONTACT FORM ======================
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(contactForm);
        const data = {
            firstName: formData.get('firstName'),
            lastName:  formData.get('lastName'),
            email:     formData.get('email'),
            subject:   formData.get('subject'),
            category:  formData.get('program') || 'N/A',
            message:   formData.get('message')
        };

        const submitBtn = contactForm.querySelector('button[type="submit"]') || contactForm.querySelector('button');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = "Sending...";
        submitBtn.disabled = true;

        try {
            const res = await fetch('/.netlify/functions/save-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();

            if (result.success) {
                const popup = document.getElementById('contact-success-popup');
                if (popup) {
                    popup.classList.add('show');
                    setTimeout(() => popup.classList.remove('show'), 8000);
                }
                const closeBtn = document.getElementById('contact-popup-close');
                if (closeBtn) closeBtn.onclick = () => popup.classList.remove('show');
                contactForm.reset();
            } else {
                showErrorPopup("Error: " + (result.error || "Unknown"));
            }
        } catch (err) {
            showErrorPopup("Network error. Please try again.");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
});





/* ═══════════════════════════════════════════════════════════════
   BBW4LIFE — PRODUCT CARE PAGE — SCRIPT
   À ajouter dans pages.js
   Se déclenche uniquement sur la page product-care
═══════════════════════════════════════════════════════════════ */

// ── Guard : n'exécute que sur la page product-care ──
if (document.querySelector('.pc-categories-section')) {
  initProductCarePage();
}

function initProductCarePage() {

  /* ─────────────────────────────────────────────
     1. PARTICULES HERO
  ───────────────────────────────────────────── */
  (function initHeroParticles() {
    const container = document.getElementById('pcHeroParticles');
    if (!container) return;

    const count = 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'pc-hero-particle';

      const size  = (Math.random() * 3.5 + 1.5).toFixed(1);
      const x     = (Math.random() * 90 + 5).toFixed(1);
      const y     = (Math.random() * 60 + 5).toFixed(1);
      const dur   = (Math.random() * 5 + 4).toFixed(1);
      const delay = (Math.random() * 6).toFixed(1);

      p.style.cssText = `
        --pc-size: ${size}px;
        --pc-x: ${x}%;
        --pc-y: ${y}%;
        --pc-dur: ${dur}s;
        --pc-delay: ${delay}s;
      `;
      container.appendChild(p);
    }
  })();

  /* ─────────────────────────────────────────────
     2. TABS — navigation entre catégories
  ───────────────────────────────────────────── */
  (function initTabs() {
    const tabBtns   = document.querySelectorAll('.pc-tab-btn');
    const tabPanels = document.querySelectorAll('.pc-tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        // Retirer active de tous
        tabBtns.forEach(b => {
          b.classList.remove('pc-tab-btn--active');
          b.setAttribute('aria-selected', 'false');
        });
        tabPanels.forEach(p => p.classList.remove('pc-tab-panel--active'));

        // Activer le bon
        btn.classList.add('pc-tab-btn--active');
        btn.setAttribute('aria-selected', 'true');

        const panel = document.getElementById('tab-' + target);
        if (panel) {
          panel.classList.add('pc-tab-panel--active');
          // Relancer les animations des cartes dans ce panel
          panel.querySelectorAll('[data-pc-reveal]').forEach(el => {
            el.classList.remove('pc-revealed');
            // Force reflow
            void el.offsetWidth;
            el.classList.add('pc-revealed');
          });
        }
      });
    });
  })();

  /* ─────────────────────────────────────────────
     3. REVEAL AU SCROLL (IntersectionObserver)
  ───────────────────────────────────────────── */
  (function initReveal() {
    const els = document.querySelectorAll('[data-pc-reveal]');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('pc-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    els.forEach(el => observer.observe(el));
  })();

  /* ─────────────────────────────────────────────
     4. FAQ ACCORDION
  ───────────────────────────────────────────── */
  (function initFaq() {
    const faqItems = document.querySelectorAll('.pc-faq-item');

    faqItems.forEach(item => {
      const btn    = item.querySelector('.pc-faq-question');
      const answer = item.querySelector('.pc-faq-answer');
      if (!btn || !answer) return;

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('pc-faq-open');

        // Fermer tous les autres
        faqItems.forEach(other => {
          if (other !== item) {
            other.classList.remove('pc-faq-open');
            const otherBtn    = other.querySelector('.pc-faq-question');
            const otherAnswer = other.querySelector('.pc-faq-answer');
            if (otherBtn)    otherBtn.setAttribute('aria-expanded', 'false');
            if (otherAnswer) otherAnswer.classList.remove('pc-faq-answer--open');
          }
        });

        // Toggle l'actuel
        if (isOpen) {
          item.classList.remove('pc-faq-open');
          btn.setAttribute('aria-expanded', 'false');
          answer.classList.remove('pc-faq-answer--open');
        } else {
          item.classList.add('pc-faq-open');
          btn.setAttribute('aria-expanded', 'true');
          answer.classList.add('pc-faq-answer--open');
        }
      });
    });
  })();

  /* ─────────────────────────────────────────────
     5. SMOOTH SCROLL — lien "#pc-categories"
  ───────────────────────────────────────────── */
  (function initSmoothScroll() {
    const scrollCta = document.querySelector('.pc-hero-scroll-cta');
    if (!scrollCta) return;

    scrollCta.addEventListener('click', (e) => {
      const href   = scrollCta.getAttribute('href');
      const target = href && href.startsWith('#') ? document.querySelector(href) : null;
      if (!target) return;

      e.preventDefault();
      const offset = 80; // hauteur header fixe estimée
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  })();

  /* ─────────────────────────────────────────────
     6. CARE CARD — effet ripple au clic
  ───────────────────────────────────────────── */
  (function initCardRipple() {
    const cards = document.querySelectorAll('.pc-care-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        const ripple = document.createElement('span');
        const rect   = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ripple.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: 0; height: 0;
          border-radius: 50%;
          background: rgba(201, 150, 62, 0.18);
          transform: translate(-50%, -50%);
          animation: pc-ripple 0.55s ease-out forwards;
          pointer-events: none;
          z-index: 10;
        `;
        card.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });

    // Injection du keyframe ripple si absent
    if (!document.querySelector('#pc-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'pc-ripple-style';
      style.textContent = `
        @keyframes pc-ripple {
          to { width: 220px; height: 220px; opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  })();

  /* ─────────────────────────────────────────────
     7. SYMBOL ITEM — animation au scroll
  ───────────────────────────────────────────── */
  (function initSymbolsReveal() {
    const symbols = document.querySelectorAll('.pc-symbol-item');
    if (!symbols.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, idx) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, idx * 60);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.10 });

    symbols.forEach(sym => {
      sym.style.opacity    = '0';
      sym.style.transform  = 'translateY(24px)';
      sym.style.transition = 'opacity 0.55s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)';
      observer.observe(sym);
    });
  })();

} // fin initProductCarePage



/* ═══════════════════════════════════════════════════════════
   BBW4LIFE — DISCLAIMER PAGE SCRIPTS
═══════════════════════════════════════════════════════════ */


(function () {
  const bg = document.getElementById('discHeartsBg');
  if (!bg) return;

  const hearts = ['♥', '❤', '♡'];

  for (let i = 0; i < 18; i++) {
    const el = document.createElement('span');
    el.className = 'disc-heart-float';
    el.textContent = hearts[Math.floor(Math.random() * hearts.length)];

    const size = 8 + Math.random() * 14;
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: -20px;
      font-size: ${size}px;
      animation-duration: ${14 + Math.random() * 20}s;
      animation-delay: ${Math.random() * 18}s;
      opacity: 0;
      color: ${Math.random() > 0.5
        ? 'rgba(192,56,94,0.18)'
        : 'rgba(201,150,62,0.14)'};
    `;
    bg.appendChild(el);
  }
})();



(function () {
  const cards = document.querySelectorAll('.disc-card');
  if (!cards.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const index = Array.from(cards).indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('disc-card--visible');
        }, 80 * index);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  cards.forEach(card => observer.observe(card));
})();



(function () {
  const sectionIds = [
    'disc-mission',
    'disc-products',
    'disc-brand',
    'disc-style',
    'disc-legal',
    'disc-ip',
    'disc-changes'
  ];

  const links = document.querySelectorAll('.disc-toc-list li a');

  const onScroll = () => {
    let current = '';

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 140) {
        current = id;
      }
    });

    links.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === '#' + current) {
        a.classList.add('active');
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
})();

