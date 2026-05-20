/* =================================================================
   Chronos — Scroll-Driven App
   Lenis smooth scroll + GSAP ScrollTrigger + canvas frame rendering
   ================================================================= */

(() => {
  'use strict';

  // ---------- CONFIG ----------
  const FRAME_COUNT = 239;            // motion-interpolated frames (48 fps, ~5 s source)
  const FRAME_PATH = (i) => `frames/frame_${String(i).padStart(4, '0')}.webp`;
  const FRAME_SPEED = 1.05;           // motion completes near end of scroll for sustained dynamism
  const IMAGE_SCALE = 0.85;           // 0.82–0.90 padded-cover sweet spot
  const PRIMING_FRAMES = 14;          // load first N frames before showing the page

  // Canvas "breath" — subtle scale oscillation throughout the scroll so the
  // product feels cinematic even on slow-moving frames
  const BREATH_AMPLITUDE = 0.035;     // 3.5% scale variation
  const BREATH_FREQUENCY = 3;         // number of breath cycles across the full scroll

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- DOM ----------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const canvasWrap = document.getElementById('canvas-wrap');
  const heroSection = document.getElementById('hero');
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderFrames = document.getElementById('loader-frames');
  const darkOverlay = document.getElementById('dark-overlay');
  const scrollContainer = document.getElementById('scroll-container');
  const heroChars = document.querySelectorAll('.hero-heading .char');
  const heroTagline = document.querySelector('.hero-tagline');
  const scrollIndicator = document.querySelector('.scroll-indicator');
  const heroMetaRight = document.querySelector('.hero-meta-right');
  const marqueeWrap = document.getElementById('marquee-1');
  const marqueeText = marqueeWrap?.querySelector('.marquee-text');
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  // ---------- STATE ----------
  const frames = new Array(FRAME_COUNT);
  let framesLoaded = 0;
  let currentFrame = -1;
  // Page bg is pure #000 (per spec). Canvas fill MUST match exactly to avoid
  // a visible seam where the canvas ends and the page begins.
  const bgColor = '#000000';
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let breathScale = 1.0;              // updated continuously by scroll
  let canvasYOffset = 0;              // subtle parallax drift

  // ====================================================================
  // CANVAS SIZING
  // ====================================================================
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (currentFrame >= 0 && frames[currentFrame]) {
      drawFrame(currentFrame);
    }
  }

  // ====================================================================
  // DRAW FRAME (padded cover, pure-black fill, breathing scale, parallax drift)
  // ====================================================================
  function drawFrame(index) {
    const img = frames[index];
    if (!img || !img.complete) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    // base padded-cover scale × breathing oscillation
    const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE * breathScale;
    const dw = iw * scale, dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2 + canvasYOffset * dpr;

    // Pure #000 fill matches the page background exactly — no visible seam
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);

    // Edge fade — pure-black radial that softens the frame edges into the page bg
    const grad = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch)*0.30, cw/2, ch/2, Math.max(cw,ch)*0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.70)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
  }

  // ====================================================================
  // FRAME LOADER — two-phase
  // ====================================================================
  function updateLoaderUI() {
    const pct = Math.round((framesLoaded / FRAME_COUNT) * 100);
    if (loaderBar) loaderBar.style.width = pct + '%';
    if (loaderPercent) loaderPercent.textContent = pct + '%';
    if (loaderFrames) loaderFrames.textContent = `${framesLoaded} / ${FRAME_COUNT} frames`;
  }

  function loadFrame(i) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        frames[i] = img;
        framesLoaded++;
        updateLoaderUI();
        resolve();
      };
      img.onerror = () => {
        framesLoaded++;
        updateLoaderUI();
        resolve();
      };
      img.src = FRAME_PATH(i + 1); // file naming is 1-indexed
    });
  }

  async function loadFramesPrimed() {
    // Phase 1: critical first frames in parallel
    const primingCount = Math.min(PRIMING_FRAMES, FRAME_COUNT);
    await Promise.all(Array.from({ length: primingCount }, (_, i) => loadFrame(i)));
    // draw frame 0 immediately so canvas isn't blank
    if (frames[0]) drawFrame(0);
    // Phase 2: rest in background
    for (let i = primingCount; i < FRAME_COUNT; i++) {
      // sequential to avoid network congestion
      // eslint-disable-next-line no-await-in-loop
      await loadFrame(i);
    }
  }

  // ====================================================================
  // BOOT — once frames loaded, hide loader & init scroll
  // ====================================================================
  function hideLoader() {
    if (!loader) return;
    loader.classList.add('loaded');
  }

  async function boot() {
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    await loadFramesPrimed();
    drawFrame(0);
    hideLoader();
    initHeroIntro();
    initScrollSystem();
  }

  // ====================================================================
  // HERO INTRO — staggered word reveal
  // ====================================================================
  function initHeroIntro() {
    if (reduceMotion) {
      heroChars.forEach(c => { c.style.transform = 'none'; c.style.opacity = '1'; });
      if (heroTagline) { heroTagline.style.opacity = '1'; heroTagline.style.transform = 'none'; }
      if (scrollIndicator) scrollIndicator.style.opacity = '1';
      if (heroMetaRight) heroMetaRight.style.opacity = '1';
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.to(heroChars, { y: 0, opacity: 1, duration: 0.9, stagger: 0.06 }, 0)
      .to(heroTagline, { y: 0, opacity: 1, duration: 0.9 }, 0.4)
      .to(scrollIndicator, { opacity: 1, duration: 0.8 }, 0.9)
      .to(heroMetaRight, { opacity: 1, duration: 0.8 }, 0.9);
  }

  // ====================================================================
  // SCROLL SYSTEM (Lenis + GSAP + ScrollTrigger)
  // ====================================================================
  function initScrollSystem() {
    // --- Lenis ---
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false
    });
    gsap.registerPlugin(ScrollTrigger);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // ----- Anchor smooth-scroll -----
    // Scroll sections are position:fixed (so getBoundingClientRect is viewport-
    // relative). Map anchor IDs to their ST-progress center and compute the
    // actual scrollY for that progress.
    const anchorProgress = {
      'hero': null,              // null = scroll back to page top
      'features': 0.23,          // section 001 (Introduction) center
      'dissection': 0.93,        // section 007 (Dissection) center
      'reserve': 0.985           // section 008 (CTA) center
    };

    function scrollToAnchor(id) {
      const key = id.replace(/^#/, '');
      const stProgress = anchorProgress[key];
      if (stProgress === null) {
        lenis.scrollTo(0, { duration: 1.6 });
        return;
      }
      if (stProgress === undefined) return;
      const sc = document.getElementById('scroll-container');
      if (!sc) return;
      const rect = sc.getBoundingClientRect();
      const scTop = rect.top + window.pageYOffset;
      const scHeight = sc.offsetHeight;
      const targetY = scTop + stProgress * (scHeight - window.innerHeight);
      lenis.scrollTo(targetY, { duration: 1.6 });
    }

    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length > 1) {
          e.preventDefault();
          scrollToAnchor(id);
        }
      });
    });

    // --- Frame-to-scroll binding + canvas breath/drift ---
    if (!reduceMotion) {
      let lastBreathPaint = 0;
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          // sinusoidal breath: slow scale oscillation
          const phase = p * Math.PI * 2 * BREATH_FREQUENCY;
          breathScale = 1 + Math.sin(phase) * BREATH_AMPLITUDE;
          // mild vertical drift: -10..+10 px across full scroll
          canvasYOffset = (p - 0.5) * 20;

          const accelerated = Math.min(p * FRAME_SPEED, 1);
          const index = Math.min(Math.floor(accelerated * FRAME_COUNT), FRAME_COUNT - 1);

          // Repaint whenever frame index changes OR breath shifted meaningfully
          const breathDelta = Math.abs(breathScale - lastBreathPaint);
          if (index !== currentFrame && frames[index]) {
            currentFrame = index;
            lastBreathPaint = breathScale;
            requestAnimationFrame(() => drawFrame(currentFrame));
          } else if (breathDelta > 0.004 && currentFrame >= 0) {
            // breath has shifted enough — re-paint current frame
            lastBreathPaint = breathScale;
            requestAnimationFrame(() => drawFrame(currentFrame));
          }
        }
      });
    } else {
      // static hero frame for reduced motion
      drawFrame(0);
    }

    // --- Hero exit + circle-wipe reveal ---
    initHeroTransition();

    // --- Marquee horizontal scroll ---
    if (marqueeText) {
      // Single ScrollTrigger drives both opacity (in/out) and horizontal slide
      gsap.to(marqueeText, {
        xPercent: -25,
        ease: 'none',
        scrollTrigger: {
          trigger: scrollContainer,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true
        }
      });
      // Opacity in 0.08→0.18, opaque 0.18→0.85, fade out 0.85→0.92
      ScrollTrigger.create({
        trigger: scrollContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const p = self.progress;
          let opacity = 0;
          if (p >= 0.08 && p < 0.18) opacity = (p - 0.08) / 0.10;
          else if (p >= 0.18 && p < 0.85) opacity = 1;
          else if (p >= 0.85 && p < 0.92) opacity = 1 - (p - 0.85) / 0.07;
          marqueeWrap.style.opacity = opacity;
        }
      });
    }

    // --- Section animations ---
    document.querySelectorAll('.scroll-section').forEach(section => {
      setupSectionAnimation(section);
    });

    // --- Counters ---
    setupCounters();

    // --- Dark overlay (only for stats) ---
    const statsSection = document.querySelector('.section-stats');
    if (statsSection) {
      const enter = parseFloat(statsSection.dataset.enter) / 100;
      const leave = parseFloat(statsSection.dataset.leave) / 100;
      initDarkOverlay(enter, leave);
    }

    // --- Dissection callouts ---
    setupDissectionCallouts();

    ScrollTrigger.refresh();
  }

  // ====================================================================
  // HERO → CANVAS CIRCLE WIPE
  // ====================================================================
  function initHeroTransition() {
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        // hero fades out quickly at start
        const heroFade = Math.max(0, 1 - p * 18);
        heroSection.style.opacity = heroFade;
        // canvas reveals via expanding circle clip-path
        const wipeProgress = Math.min(1, Math.max(0, (p - 0.005) / 0.05));
        const radius = wipeProgress * 90;
        canvasWrap.style.clipPath = `circle(${radius}% at 50% 50%)`;
      }
    });
  }

  // ====================================================================
  // SECTION ANIMATION SYSTEM
  // ====================================================================
  function setupSectionAnimation(section) {
    const type = section.dataset.animation || 'fade-up';
    const persist = section.dataset.persist === 'true';
    const enter = parseFloat(section.dataset.enter) / 100;
    const leave = parseFloat(section.dataset.leave) / 100;
    if (isNaN(enter) || isNaN(leave)) return;

    const children = section.querySelectorAll(
      '.section-label, .section-heading, .section-body, .section-meta, .stat, .cta-row, .cta-meta, .dissection-stage'
    );
    if (!children.length) return;

    // Set initial state (off-screen / hidden)
    let from = {};
    switch (type) {
      case 'fade-up':    from = { y: 50, opacity: 0 }; break;
      case 'slide-left': from = { x: -80, opacity: 0 }; break;
      case 'slide-right':from = { x: 80, opacity: 0 }; break;
      case 'scale-up':   from = { scale: 0.85, opacity: 0 }; break;
      case 'rotate-in':  from = { y: 40, rotation: 3, opacity: 0 }; break;
      case 'stagger-up': from = { y: 60, opacity: 0 }; break;
      case 'clip-reveal':from = { clipPath: 'inset(100% 0 0 0)', opacity: 0 }; break;
      default:           from = { y: 40, opacity: 0 };
    }

    gsap.set(children, from);

    const ease = (type === 'scale-up') ? 'power2.out'
               : (type === 'clip-reveal') ? 'power4.inOut'
               : 'power3.out';
    const duration = (type === 'clip-reveal') ? 1.2
                    : (type === 'scale-up') ? 1.0
                    : 0.9;
    const stagger = (type === 'clip-reveal' || type === 'stagger-up') ? 0.15
                  : (type === 'slide-left' || type === 'slide-right') ? 0.14
                  : 0.12;

    const tl = gsap.timeline({ paused: true });
    tl.to(children, {
      y: 0, x: 0, scale: 1, rotation: 0, opacity: 1,
      clipPath: 'inset(0% 0 0 0)',
      duration, stagger, ease
    });

    // Show the section when its range is on screen — with feathered fade in/out
    let entered = false;
    const featherIn = 0.022;   // smooth opacity ramp at entry
    const featherOut = 0.025;  // smooth opacity ramp at exit
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        let visibility = 0;
        if (p >= enter - featherIn && p < enter) {
          visibility = (p - (enter - featherIn)) / featherIn;
        } else if (p >= enter && p <= leave) {
          visibility = 1;
        } else if (persist && p > leave) {
          visibility = 1;                                       // CTA persists
        } else if (p > leave && p <= leave + featherOut) {
          visibility = 1 - (p - leave) / featherOut;
        }
        section.style.opacity = visibility;
        section.style.pointerEvents = visibility > 0.5 ? 'auto' : 'none';

        // Play the inner timeline once we cross the enter line
        if (visibility > 0 && !entered) {
          entered = true;
          tl.play();
        } else if (!persist && entered && (p < enter - featherIn - 0.03 || p > leave + featherOut + 0.05)) {
          // reset only when truly outside; persist sections never reset
          entered = false;
          tl.progress(0).pause();
          gsap.set(children, from);
        }
      }
    });
  }

  // ====================================================================
  // COUNTERS
  // ====================================================================
  function setupCounters() {
    document.querySelectorAll('.stat-number').forEach(el => {
      const target = parseFloat(el.dataset.value);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const formatter = (val) => {
        return decimals === 0
          ? Math.round(val).toLocaleString()
          : val.toFixed(decimals);
      };
      const obj = { v: 0 };
      const trigger = el.closest('.scroll-section');
      const enter = parseFloat(trigger.dataset.enter) / 100;
      let started = false;

      ScrollTrigger.create({
        trigger: scrollContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          if (!started && self.progress >= enter - 0.005) {
            started = true;
            gsap.to(obj, {
              v: target,
              duration: 1.6,
              ease: 'power2.out',
              onUpdate: () => { el.textContent = formatter(obj.v); }
            });
          }
        }
      });
    });
  }

  // ====================================================================
  // DARK OVERLAY (stats)
  // ====================================================================
  function initDarkOverlay(enter, leave) {
    const fadeRange = 0.025;
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        let opacity = 0;
        if (p >= enter - fadeRange && p < enter) {
          opacity = (p - (enter - fadeRange)) / fadeRange * 0.9;
        } else if (p >= enter && p <= leave) {
          opacity = 0.9;
        } else if (p > leave && p <= leave + fadeRange) {
          opacity = 0.9 * (1 - (p - leave) / fadeRange);
        }
        darkOverlay.style.opacity = opacity;
      }
    });
  }

  // ====================================================================
  // DISSECTION CALLOUTS
  // ====================================================================
  function setupDissectionCallouts() {
    const section = document.querySelector('.section-dissection');
    if (!section) return;
    const enter = parseFloat(section.dataset.enter) / 100;
    const leave = parseFloat(section.dataset.leave) / 100;
    const range = leave - enter;
    const callouts = section.querySelectorAll('.callout');

    callouts.forEach((c, i) => {
      // stagger callouts across the section's scroll range
      const delay = 0.15 + (i / callouts.length) * 0.6;
      const triggerPoint = enter + range * delay;
      let revealed = false;

      ScrollTrigger.create({
        trigger: scrollContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          if (!revealed && self.progress >= triggerPoint) {
            revealed = true;
            gsap.fromTo(c,
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
            );
            // animate the line drawing
            const line = c.querySelector('.line');
            if (line) {
              gsap.fromTo(line,
                { scaleX: 0 },
                { scaleX: 1, duration: 0.6, ease: 'power2.out', delay: 0.1 }
              );
            }
          } else if (revealed && self.progress < triggerPoint - 0.01) {
            revealed = false;
            gsap.to(c, { opacity: 0, duration: 0.3 });
          }
        }
      });
    });
  }

  // ====================================================================
  // MOBILE MENU
  // ====================================================================
  function initMobileMenu() {
    if (!menuBtn || !mobileMenu) return;
    const close = () => {
      mobileMenu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    const open = () => {
      mobileMenu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    menuBtn.addEventListener('click', () => {
      if (mobileMenu.hidden) open(); else close();
    });
    mobileMenu.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', close);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileMenu.hidden) close();
    });
  }

  // ====================================================================
  // INIT
  // ====================================================================
  initMobileMenu();
  boot();

})();
