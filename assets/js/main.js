/* ==========================================================================
   Jual Kursi Sekolah Jakarta — interactions
   Sticky header, mobile navigation, subtle scroll reveal, FAQ accordion,
   dan showcase interaktif (gambar kiri mengikuti kartu aktif).
   ========================================================================== */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DESKTOP_QUERY = '(min-width: 993px)';

  /* ---------------------------------------------------------------------
     Sticky header shadow
     --------------------------------------------------------------------- */
  var header = document.getElementById('siteHeader');

  function syncHeader() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }

  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  /* ---------------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------------- */
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');

  function setMobileNav(open) {
    if (!navToggle || !mobileNav) return;
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    mobileNav.classList.toggle('is-open', open);
    mobileNav.hidden = !open;
    document.body.classList.toggle('nav-open', open);
  }

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      setMobileNav(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    mobileNav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMobileNav(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setMobileNav(false);
        navToggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia(DESKTOP_QUERY).matches) setMobileNav(false);
    });
  }

  /* ---------------------------------------------------------------------
     Placeholder links (pages that do not exist yet)
     --------------------------------------------------------------------- */
  Array.prototype.slice
    .call(document.querySelectorAll('[data-placeholder="true"]'))
    .forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
      });
    });

  /* ---------------------------------------------------------------------
     Active navigation link while scrolling
     --------------------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[href^="#"]'));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute('href').slice(1);
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (link) {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    );

    sections.forEach(function (section) {
      navObserver.observe(section);
    });
  }

  /* ---------------------------------------------------------------------
     Showcase kebutuhan ruang — gambar kiri mengikuti kartu aktif di kanan.
     Scroll di dalam section ini dijalankan sendiri (bukan scroll snapping
     bawaan browser) supaya:
       - satu gesture scroll = tepat satu kartu, urut ke atas maupun ke bawah,
         jadi scroll cepat tidak melompati beberapa nomor;
       - perpindahan singkat 170-330 ms dan highlight/gambar berganti seketika,
         jadi terasa langsung tanpa delay;
       - section lain tetap memakai scroll normal karena section ini hanya
         "dipegang" selama garis tengah viewport ada di daftar kartu.
     --------------------------------------------------------------------- */
  var showcase = document.querySelector('[data-showcase]');

  if (showcase) {
    var showcaseList = showcase.querySelector('.showcase__list');
    var showcaseItems = Array.prototype.slice.call(showcase.querySelectorAll('[data-showcase-item]'));
    var showcaseImages = Array.prototype.slice.call(showcase.querySelectorAll('[data-showcase-image]'));
    var showcaseDesktop = window.matchMedia(DESKTOP_QUERY);
    var rootEl = document.documentElement;

    /* Parameter perilaku scroll (milidetik & piksel). */
    var WHEEL_IDLE = 150;        /* jeda yang menandai gesture wheel baru */
    var STEP_MIN = 26;           /* akumulasi minimum untuk mengambil satu langkah */
    var FLING_MIN = 44;          /* satu event besar = putaran cepat (langkah antre) */
    var SETTLE_IDLE = 120;       /* jeda sebelum posisi dirapikan ke tengah kartu */
    var SETTLE_MIN = 4;          /* jarak di bawah ini sudah dianggap rapi */
    var SETTLE_MAX_RATIO = 0.6;  /* batas tarikan perapian (bagian dari viewport) */
    var SCROLL_FALLBACK = 100;   /* pengaman sinkronisasi bila rAF di-throttle */

    var activeIndex = -1;
    var animating = false;
    var animDirection = 0;
    var animToken = 0;
    var animFrame = 0;
    var animGuard = 0;
    var animBehavior = '';
    var queuedDirection = 0;
    var wheelAccum = 0;
    var wheelDirection = 0;
    var wheelAt = 0;
    var wheelTimer = 0;
    var settleTimer = 0;
    var scrollTicking = false;

    function now() {
      return window.performance && window.performance.now ? window.performance.now() : Date.now();
    }

    function maxScrollTop() {
      return Math.max(0, rootEl.scrollHeight - window.innerHeight);
    }

    function clampScroll(value) {
      return Math.min(Math.max(value, 0), maxScrollTop());
    }

    /* Posisi scroll yang menempatkan tengah kartu tepat di tengah viewport. */
    function centerScrollTop(item) {
      var rect = item.getBoundingClientRect();
      return clampScroll(window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    }

    /* Indeks kartu yang tengahnya paling dekat dengan tengah viewport. */
    function nearestIndex() {
      var center = window.innerHeight / 2;
      var best = -1;
      var bestDistance = Infinity;

      for (var i = 0; i < showcaseItems.length; i += 1) {
        var rect = showcaseItems[i].getBoundingClientRect();
        var distance = Math.abs(rect.top + rect.height / 2 - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }

      return best;
    }

    function setActiveIndex(index) {
      if (index < 0 || index >= showcaseItems.length || index === activeIndex) return;
      activeIndex = index;

      showcaseItems.forEach(function (item, position) {
        var isActive = position === index;
        item.classList.toggle('is-active', isActive);
        if (isActive) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });

      showcaseImages.forEach(function (image, position) {
        image.classList.toggle('is-active', position === index);
      });
    }

    function showcaseInView() {
      var rect = showcase.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    /* Section "dipegang" hanya saat garis tengah viewport berada di daftar
       kartu. Di luar itu, termasuk saat user ada di section lain, scroll
       berjalan normal dan tidak pernah ditahan. */
    function isEngaged() {
      if (!showcaseList) return false;
      var rect = showcaseList.getBoundingClientRect();
      var center = window.innerHeight / 2;
      return rect.top <= center && rect.bottom >= center;
    }

    /* Highlight & gambar selalu mengikuti posisi scroll, jadi tidak ada nomor
       yang terlewat walau user memakai touch, scrollbar, atau keyboard. */
    function syncShowcase() {
      if (!showcaseInView()) return;
      var index = nearestIndex();
      if (index >= 0) setActiveIndex(index);
    }

    /* -------------------------------------------------------------------
       Mesin animasi scroll sendiri: durasi 170-330 ms (bukan animasi
       `smooth` bawaan yang lambat) dan mudah dihentikan begitu user
       mengambil alih scroll.
       ------------------------------------------------------------------- */
    function stopAnimation() {
      if (!animating) return;

      animating = false;
      animToken += 1; /* batalkan frame yang masih terjadwal */
      if (animFrame) {
        window.cancelAnimationFrame(animFrame);
        animFrame = 0;
      }
      if (animGuard) {
        window.clearTimeout(animGuard);
        animGuard = 0;
      }
      rootEl.style.scrollBehavior = animBehavior;
    }

    function animateTo(target, direction) {
      stopAnimation();

      var full = target - window.scrollY;
      var duration = prefersReducedMotion
        ? 0
        : Math.round(Math.min(330, Math.max(170, 140 + Math.abs(full) * 0.22)));

      if (duration <= 0) {
        window.scrollTo(0, target);
        endAnimation();
        return;
      }

      var token = animToken;
      var from = window.scrollY;
      var startedAt = 0;

      animDirection = direction || 0;
      animating = true;
      animBehavior = rootEl.style.scrollBehavior;
      rootEl.style.scrollBehavior = 'auto'; /* matikan smooth bawaan selama animasi */

      function frame(time) {
        if (!animating || token !== animToken) return;
        if (!startedAt) startedAt = time;

        var progress = Math.min(1, (time - startedAt) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        var next = from + full * eased;

        window.scrollTo(0, next);

        if (progress < 1) {
          animFrame = window.requestAnimationFrame(frame);
          return;
        }

        stopAnimation();
        endAnimation();
      }

      animFrame = window.requestAnimationFrame(frame);

      /* Pengaman: bila requestAnimationFrame di-throttle (tab tidak aktif,
         frame jarang diproduksi), perpindahan tetap diselesaikan tepat waktu
         supaya input berikutnya tidak pernah tertahan. */
      animGuard = window.setTimeout(function () {
        if (token !== animToken) return;
        window.scrollTo(0, target);
        stopAnimation();
        endAnimation();
      }, duration + 80);
    }

    /* User mengambil alih scroll (touch, drag, atau tombol papan ketik):
       animasi kita dihentikan supaya tidak berkelahi dengan input user. */
    function cancelAnimation() {
      if (!animating) return;
      stopAnimation();
      syncShowcase();
      scheduleSettle();
    }

    ['touchstart', 'pointerdown'].forEach(function (type) {
      window.addEventListener(type, cancelAnimation, { passive: true });
    });

    window.addEventListener('keydown', function (event) {
      if (!animating) return;
      if (!/^(Arrow|Page|Home|End)/.test(event.key) && event.key !== ' ' && event.key !== 'Spacebar') return;
      cancelAnimation();
    }, { passive: true });

    /* Akhir satu perpindahan: sisa gesture dibuang supaya satu gesture tidak
       pernah melompat lebih dari satu kartu, sementara putaran cepat yang
       masih berlanjut boleh menitipkan tepat satu langkah berikutnya. */
    function endAnimation() {
      resetWheel();

      var direction = queuedDirection;
      queuedDirection = 0;

      if (direction && canStep(direction)) {
        step(direction);
        return;
      }

      syncShowcase();
    }

    function activeIndexForStep() {
      var index = nearestIndex();
      return index >= 0 ? index : activeIndex;
    }

    function canStep(direction) {
      var index = activeIndexForStep();
      if (index < 0) return false;
      var next = index + direction;
      return next >= 0 && next < showcaseItems.length;
    }

    /* Satu langkah = tepat satu kartu. */
    function step(direction) {
      if (animating || !canStep(direction)) return false;

      var next = activeIndexForStep() + direction;
      setActiveIndex(next); /* highlight & gambar berganti seketika */
      animateTo(centerScrollTop(showcaseItems[next]), direction);
      return true;
    }

    function normalizeWheelDelta(event) {
      var delta = event.deltaY || 0;
      if (event.deltaMode === 1) delta *= 16; /* baris ke piksel */
      else if (event.deltaMode === 2) delta *= window.innerHeight; /* halaman ke piksel */
      return delta;
    }

    function resetWheel() {
      if (wheelTimer) {
        window.clearTimeout(wheelTimer);
        wheelTimer = 0;
      }
      wheelAccum = 0;
      wheelDirection = 0;
      wheelAt = 0;
    }

    /* Satu gesture wheel/trackpad = satu kartu, ke bawah maupun ke atas.
       Di ujung daftar event dibiarkan lewat supaya user bisa keluar dari
       section ini dengan scroll biasa (tidak ada penahanan). */
    function onWheel(event) {
      if (event.ctrlKey || event.metaKey) return; /* biarkan pinch zoom */

      if (!isEngaged()) {
        resetWheel();
        return;
      }

      var delta = normalizeWheelDelta(event);
      if (!delta) return;

      var direction = delta > 0 ? 1 : -1;

      if (animating) {
        /* Animasi perapian posisi: input user selalu menang. */
        if (animDirection === 0) {
          stopAnimation();
        } else {
          event.preventDefault();
          if (direction === animDirection && Math.abs(delta) >= FLING_MIN) queuedDirection = direction;
          return;
        }
      }

      var time = now();
      if (direction !== wheelDirection || time - wheelAt > WHEEL_IDLE) wheelAccum = 0;
      wheelDirection = direction;
      wheelAt = time;
      wheelAccum += delta;

      if (Math.abs(wheelAccum) < STEP_MIN) return; /* gesture kecil: biarkan native */
      if (!canStep(direction)) {
        resetWheel();
        return;
      }

      event.preventDefault();
      resetWheel();
      step(direction);
    }

    /* Gesture yang datang selama animasi tetap ditahan supaya tidak ada
       scroll ganda di luar kendali. */
    window.addEventListener('wheel', onWheel, { passive: false });

    /* -------------------------------------------------------------------
       Perapian posisi (pengganti scroll snapping bawaan): setelah scroll
       manual benar-benar berhenti, posisi digeser singkat ke tengah kartu
       terdekat. Hanya aktif selama section ini "dipegang", jadi section
       lain tidak pernah ikut tertarik.
       ------------------------------------------------------------------- */
    function runSettle() {
      if (prefersReducedMotion || animating || !isEngaged()) return;

      var index = nearestIndex();
      if (index < 0) return;

      var target = centerScrollTop(showcaseItems[index]);
      var distance = target - window.scrollY;
      if (Math.abs(distance) < SETTLE_MIN) return;
      if (Math.abs(distance) > window.innerHeight * SETTLE_MAX_RATIO) return;

      setActiveIndex(index);
      animateTo(target, 0);
    }

    function scheduleSettle() {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(function () {
        settleTimer = 0;
        runSettle();
      }, SETTLE_IDLE);
    }

    function scrollTick() {
      if (!scrollTicking) return;
      scrollTicking = false;
      if (!animating) syncShowcase();
      scheduleSettle();
    }

    window.addEventListener('scroll', function () {
      if (scrollTicking) return;
      scrollTicking = true;

      window.requestAnimationFrame(scrollTick);

      /* Pengaman bila requestAnimationFrame di-throttle: sinkronisasi tetap
         berjalan lewat timer singkat sehingga highlight tidak pernah tertinggal. */
      window.setTimeout(scrollTick, SCROLL_FALLBACK);
    }, { passive: true });

    /* -------------------------------------------------------------------
       Klik kartu: kartu langsung aktif, gambar kiri ikut berganti, lalu
       halaman bergeser cepat sampai kartu tersebut ada di tengah viewport.
       ------------------------------------------------------------------- */
    function openShowcaseItem(item) {
      var index = showcaseItems.indexOf(item);
      if (index < 0) return;

      var current = activeIndexForStep();
      setActiveIndex(index);
      queuedDirection = 0;
      animateTo(centerScrollTop(item), index >= current ? 1 : -1);
    }

    /* Fokus dipindah tanpa scroll bawaan browser supaya tidak berebut dengan
       animasi perpindahan kartu. */
    function focusShowcaseItem(index) {
      var item = showcaseItems[index];
      if (!item) return;

      try {
        item.focus({ preventScroll: true });
      } catch (error) {
        item.focus();
      }
    }

    /* Kartu hanya bisa diklik pada layout dua kolom (desktop); di mobile setiap
       kartu sudah membawa gambarnya sendiri. */
    function setShowcaseClickable(clickable) {
      showcaseItems.forEach(function (item) {
        if (clickable) {
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', '0');
        } else {
          item.removeAttribute('role');
          item.removeAttribute('tabindex');
        }
      });
    }

    showcaseItems.forEach(function (item) {
      item.addEventListener('click', function (event) {
        if (!showcaseDesktop.matches) return;
        if (event.target.closest('a, button')) return;
        openShowcaseItem(item);
      });

      /* Panah atas/bawah berpindah satu kartu selama fokus ada di daftar ini;
         tombol lain tetap memakai perilaku normal. */
      item.addEventListener('keydown', function (event) {
        if (!showcaseDesktop.matches) return;
        if (event.target.closest('a, button')) return;

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          openShowcaseItem(item);
          return;
        }

        var index = showcaseItems.indexOf(item);
        var next = -1;

        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index + 1;
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = showcaseItems.length - 1;
        else return;

        if (next < 0 || next >= showcaseItems.length) return;

        event.preventDefault();
        focusShowcaseItem(next);
        openShowcaseItem(showcaseItems[next]);
      });
    });

    /* State awal, penyesuaian saat ukuran viewport berubah, dan pramuat gambar
       lain supaya pergantian gambar terasa instan. */
    setShowcaseClickable(showcaseDesktop.matches);
    syncShowcase();

    var showcaseResizing = false;

    window.addEventListener('resize', function () {
      if (showcaseResizing) return;
      showcaseResizing = true;

      window.requestAnimationFrame(function () {
        showcaseResizing = false;
        stopAnimation();
        resetWheel();
        setShowcaseClickable(showcaseDesktop.matches);
        syncShowcase();
      });
    });

    if ('IntersectionObserver' in window) {
      var showcaseLoader = new IntersectionObserver(
        function (entries, observer) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;

            showcaseImages.forEach(function (image) {
              image.loading = 'eager';
            });

            observer.disconnect();
          });
        },
        { rootMargin: '60% 0px' }
      );

      showcaseLoader.observe(showcase);
    }
  }

  /* ---------------------------------------------------------------------
     Subtle scroll reveal
     --------------------------------------------------------------------- */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  /* ---------------------------------------------------------------------
     FAQ accordion
     --------------------------------------------------------------------- */
  var faqItems = Array.prototype.slice.call(document.querySelectorAll('.faq-item'));

  function closeFaq(item) {
    var panel = item.querySelector('.faq-item__panel');
    var trigger = item.querySelector('.faq-item__trigger');
    item.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.style.maxHeight = '0px';
  }

  function openFaq(item) {
    var panel = item.querySelector('.faq-item__panel');
    var trigger = item.querySelector('.faq-item__trigger');
    item.classList.add('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';
  }

  faqItems.forEach(function (item) {
    var trigger = item.querySelector('.faq-item__trigger');
    if (!trigger) return;

    trigger.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      faqItems.forEach(closeFaq);
      if (!isOpen) openFaq(item);
    });
  });

  if (faqItems.length) {
    openFaq(faqItems[0]);

    window.addEventListener('resize', function () {
      faqItems.forEach(function (item) {
        if (!item.classList.contains('is-open')) return;
        var panel = item.querySelector('.faq-item__panel');
        if (panel) panel.style.maxHeight = panel.scrollHeight + 'px';
      });
    });
  }

  /* ---------------------------------------------------------------------
     Current year in the footer
     --------------------------------------------------------------------- */
  var yearTarget = document.querySelector('[data-current-year]');
  if (yearTarget) yearTarget.textContent = String(new Date().getFullYear());
})();