/* =========================================================
   SIGHTS — scroll-driven landmark animator
   Implements the patterns in SCROLL-ANIMATION-BEST-PRACTICES.md:
     1. WebP image sequence (via FFMPEG, see extract-frames-sights.mjs)
     2. Canvas playback — never <video>
     3. Batched preload (15-20 concurrent) of ALL frames upfront
     4. Loading screen with progress until every frame is ready
     5. position: sticky + tall scroll container (CSS)
     6. Scroll handler ONLY sets state; separate continuous rAF loop draws
     7. Phase overlays tied to scroll-position ranges (not timers)
     8. Polish: radial mask, subtle rotation, top progress bar
   Falls back to a live SVG blueprint if no manifest is found.
   ========================================================= */
(function () {
  'use strict';

  const FRAMES_PATH = 'frames/sights/';
  const MANIFEST    = FRAMES_PATH + 'manifest.json';
  const BATCH_SIZE  = 18;  // concurrent requests per batch (browsers cap ~6/host, ≈3 hosts → ~18)

  // Scroll-range definitions for phase overlays + HUD label
  const PHASES = [
    { upto: 0.45, label: 'Blueprint' },
    { upto: 0.80, label: 'Rising'    },
    { upto: 1.00, label: 'Finished'  }
  ];
  const OVERLAYS = [
    { id: 'overlay-1', start: 0.08, end: 0.26 },
    { id: 'overlay-2', start: 0.36, end: 0.54 },
    { id: 'overlay-3', start: 0.64, end: 0.82 },
    { id: 'overlay-4', start: 0.86, end: 1.00 }
  ];

  // Subtle canvas rotation range — adds 3D feel even from a 2D sequence
  const ROT_FROM_DEG = -2;
  const ROT_TO_DEG   =  3;

  // ----- elements -----
  const header       = document.getElementById('sights-header');
  const stageShell   = document.getElementById('stage');
  const stageSvg     = document.getElementById('stage-svg');
  const stageCanvasW = document.getElementById('stage-canvas');
  const canvas       = document.getElementById('frame-canvas');
  const blueprintG   = document.getElementById('blueprint-path');
  const hudPct       = document.getElementById('hud-pct');
  const hudPhase     = document.getElementById('hud-phase');
  const progressBar  = document.getElementById('scroll-progress');
  const loadingEl    = document.getElementById('loading');
  const loadingPct   = document.getElementById('loading-pct');
  const loadingBar   = document.getElementById('loading-bar');
  const loadingMeta  = document.getElementById('loading-meta');
  if (!stageShell) return;

  const overlayEls = OVERLAYS.map(o => ({ ...o, el: document.getElementById(o.id) }));

  // ----- sticky header style on scroll -----
  function onWinScroll() {
    if (window.scrollY > 24) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  onWinScroll();
  window.addEventListener('scroll', onWinScroll, { passive: true });

  // ----- helpers -----
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function stageProgress() {
    const r = stageShell.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = r.height - vh;
    if (total <= 0) return 0;
    const passed = Math.max(0, -r.top);
    return clamp01(passed / total);
  }

  function urlForFrame(n, ext, pad) {
    return FRAMES_PATH + String(n).padStart(pad || 4, '0') + '.' + (ext || 'webp');
  }

  // =========================================================
  // CANVAS PIPELINE — manifest → batched preload → render
  // =========================================================

  let frames = [];        // pre-loaded Image[]
  let frameCount = 0;
  let canvasReady = false;
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let ctx = canvas ? canvas.getContext('2d') : null;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width  * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawnFrame = -1; // force redraw at new size
    }
  }
  window.addEventListener('resize', resizeCanvas);

  // ---- the two-system pattern from §6 ----
  let currentFrame = 0;
  let drawnFrame   = -1;
  let lastProgress = -1;

  // Scroll handler — passive, ONLY computes/sets state, never draws
  function onScroll() {
    if (!canvasReady && stageSvg) return; // SVG path uses its own draw inside rAF
    const p = stageProgress();
    lastProgress = p;
    currentFrame = Math.min(Math.floor(p * frameCount), frameCount - 1);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function drawCanvasFrame(idx) {
    const img = frames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cr = cw / ch, ir = iw / ih;
    let dw, dh;
    if (ir > cr) { dw = cw; dh = cw / ir; }
    else         { dh = ch; dw = ch * ir; }
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Continuous rAF loop — runs every frame, but only DRAWS when state changes
  function tick() {
    const p = (lastProgress >= 0) ? lastProgress : stageProgress();

    // Phase + percent HUD
    if (hudPct)   hudPct.textContent   = Math.round(p * 100) + '%';
    if (hudPhase) {
      const phase = PHASES.find(P => p <= P.upto) || PHASES[PHASES.length - 1];
      if (hudPhase.textContent !== phase.label) hudPhase.textContent = phase.label;
    }

    // Top scroll progress bar
    if (progressBar) progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';

    // Phase content overlays — toggle by scroll range
    for (let i = 0; i < overlayEls.length; i++) {
      const o = overlayEls[i];
      if (!o.el) continue;
      const inRange = p >= o.start && p <= o.end;
      if (inRange) o.el.classList.add('is-visible');
      else         o.el.classList.remove('is-visible');
    }

    // Subtle canvas rotation tied to scroll progress (§8 polish)
    if (canvasReady && canvas) {
      const rot = ROT_FROM_DEG + p * (ROT_TO_DEG - ROT_FROM_DEG);
      canvas.style.transform = 'rotate(' + rot.toFixed(2) + 'deg)';
    }

    // CANVAS draw — only when frame actually changed
    if (canvasReady) {
      if (currentFrame !== drawnFrame) {
        drawCanvasFrame(currentFrame);
        drawnFrame = currentFrame;
      }
    } else if (blueprintG) {
      // SVG fallback drawn here too so it animates without canvas
      updateSvg(p);
    }

    requestAnimationFrame(tick);
  }

  // ---- preload pipeline ----
  function loadFrame(n, ext, pad) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + n));
      img.src = urlForFrame(n, ext, pad);
    });
  }

  async function fetchManifest() {
    try {
      const res = await fetch(MANIFEST, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // Fallback when fetch() is blocked (e.g. file://). Uses binary-search-ish
  // probing with Image objects to find the highest existing frame number.
  async function probeManifest() {
    function probe(n) {
      return new Promise(res => {
        const img = new Image();
        img.onload  = () => res(true);
        img.onerror = () => res(false);
        img.src = urlForFrame(n, 'webp', 4);
      });
    }
    // Does frame 1 exist?
    if (!(await probe(1))) {
      // Try jpg as legacy fallback
      const jpgExists = await new Promise(res => {
        const img = new Image();
        img.onload  = () => res(true);
        img.onerror = () => res(false);
        img.src = urlForFrame(1, 'jpg', 4);
      });
      if (!jpgExists) return null;
      // exponential search jpg
      let lo = 1, hi = 2;
      while (await new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = urlForFrame(hi, 'jpg', 4); })) { lo = hi; hi *= 2; if (hi > 4096) break; }
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        const ok = await new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = urlForFrame(mid, 'jpg', 4); });
        if (ok) lo = mid; else hi = mid;
      }
      return { count: lo, ext: 'jpg', pad: 4 };
    }
    // Exponential search up, then binary down — webp
    let lo = 1, hi = 2;
    while (await probe(hi)) { lo = hi; hi *= 2; if (hi > 4096) break; }
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (await probe(mid)) lo = mid; else hi = mid;
    }
    return { count: lo, ext: 'webp', pad: 4 };
  }

  function showLoading() {
    if (!loadingEl) return;
    loadingEl.classList.add('is-on');
  }
  function hideLoading() {
    if (!loadingEl) return;
    loadingEl.classList.remove('is-on');
  }
  function setLoadingPct(p, ready, total) {
    if (loadingPct) loadingPct.textContent = Math.round(p * 100) + '%';
    if (loadingBar) loadingBar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
    if (loadingMeta) loadingMeta.textContent = ready + ' / ' + total + ' frames';
  }

  async function preloadAll(count, ext, pad) {
    const out = new Array(count);
    let ready = 0;
    setLoadingPct(0, 0, count);
    for (let i = 0; i < count; i += BATCH_SIZE) {
      const batch = [];
      for (let j = i; j < Math.min(i + BATCH_SIZE, count); j++) {
        batch.push(
          loadFrame(j + 1, ext, pad).then(img => {
            out[j] = img;
            ready++;
            setLoadingPct(ready / count, ready, count);
          })
        );
      }
      await Promise.all(batch);
    }
    return out;
  }

  async function initCanvas() {
    if (!canvas || !ctx) return false;
    let manifest = await fetchManifest();
    if (!manifest || !manifest.count || manifest.count < 1) {
      // fetch failed (e.g. file://) — probe via Image instead
      manifest = await probeManifest();
    }
    if (!manifest || !manifest.count || manifest.count < 1) return false;

    showLoading();
    try {
      frames = await preloadAll(manifest.count, manifest.ext, manifest.pad);
    } catch (e) {
      console.warn('Frame preload failed:', e);
      hideLoading();
      return false;
    }
    frameCount = frames.length;
    canvasReady = true;
    stageSvg.hidden = true;
    stageCanvasW.hidden = false;
    resizeCanvas();
    // Force first draw
    onScroll();
    drawCanvasFrame(currentFrame);
    drawnFrame = currentFrame;
    hideLoading();
    return true;
  }

  // =========================================================
  // SVG FALLBACK — draws via stroke-dashoffset when no frames
  // =========================================================

  function prepareBlueprint() {
    if (!blueprintG) return;
    const els = blueprintG.querySelectorAll('path, line, circle');
    els.forEach(el => {
      let len;
      try { len = el.getTotalLength ? el.getTotalLength() : 0; } catch (e) { len = 0; }
      if (!isFinite(len) || len <= 0) {
        if (el.tagName === 'circle') {
          const r = parseFloat(el.getAttribute('r') || 0);
          len = 2 * Math.PI * r;
        } else len = 100;
      }
      el.style.setProperty('--len', len);
      el.style.setProperty('--off', len);
    });
  }

  function updateSvg(p) {
    if (!blueprintG) return;
    const drawP = Math.min(1, p / 0.80);
    const solidP = Math.max(0, (p - 0.80) / 0.20);

    blueprintG.querySelectorAll('path, line, circle').forEach(el => {
      const len = parseFloat(el.style.getPropertyValue('--len')) || 100;
      el.style.setProperty('--off', len * (1 - drawP));
    });

    const sil = stageSvg.querySelector('.silhouette');
    if (sil) sil.style.setProperty('--solid-op', solidP.toFixed(3));
  }

  // =========================================================
  // BOOT
  // =========================================================

  prepareBlueprint();
  requestAnimationFrame(tick);

  initCanvas().then(loaded => {
    if (!loaded) {
      // SVG fallback path — re-prep in case layout shifted
      requestAnimationFrame(() => {
        prepareBlueprint();
      });
    }
  });
})();
