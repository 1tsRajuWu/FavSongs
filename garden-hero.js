/* FavSongs hero garden — trimmed Type Garden engine.
 * Fixed word, transparent canvas, auto-grows on view, sways + leans to
 * the pointer. No input, no UI, no backend. */
(() => {
  "use strict";
  const F = '"Playfair Display",Georgia,serif';
  const C = { red: '#FFB020', blue: '#5eead4', line: '#FFE2B8', text: '#FFFFFF', vein: '#0C1A15' };
  const WORD = 'shareable';

  const h = (n) => { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); };
  const spr = (t, k = 7, w = 16) => { if (t <= 0) return 0; return 1 - Math.exp(-t * k) * Math.cos(t * w); };
  const eo = (t) => { if (t <= 0) return 0; if (t >= 1) return 1; return 1 - Math.pow(1 - t, 3); };
  function rng(seed) {
    let s = seed | 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function bez(a, b, c, d, n) {
    const P = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t;
      P.push([u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]]); }
    return P;
  }
  function atPt(P, u) {
    const n = P.length, i = Math.min(n - 2, Math.max(1, Math.round(u * (n - 1))));
    return [P[i], Math.atan2(P[i+1][1] - P[i-1][1], P[i+1][0] - P[i-1][0])];
  }
  function jit(id, f, amp) {
    if (!amp) return [0, 0, 0];
    return [(h(id*1.37 + f*7.13)*2 - 1)*amp, (h(id*2.71 + f*3.11)*2 - 1)*amp, (h(id*5.3 + f*1.7)*2 - 1)*0.035];
  }
  function tracePath(c, p, closed) {
    const n = p.length; if (n < 2) return;
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const s = m(p[n-1], p[0]); c.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) { const q = m(p[i], p[(i+1) % n]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.closePath();
    } else {
      c.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < n - 1; i++) { const q = m(p[i], p[i+1]); c.quadraticCurveTo(p[i][0], p[i][1], q[0], q[1]); }
      c.lineTo(p[n-1][0], p[n-1][1]);
    }
  }
  function backend(g) {
    return {
      fill: (p, col) => { g.beginPath(); tracePath(g, p, true); g.fillStyle = col; g.fill(); },
      stroke: (p, col, w) => { g.beginPath(); tracePath(g, p, false); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); },
      text: (ch, x, y, S, col) => { g.font = `700 ${S}px ${F}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = col; g.fillText(ch, x, y); }
    };
  }
  function vine(base, dir, len, amp, waves, ph, bend, n) {
    n = n || 40; const P = [[base[0], base[1]]], step = len / n; let x = base[0], y = base[1];
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = dir + bend * u + amp * Math.sin(u * Math.PI * waves + ph) * Math.min(1, u * 3);
      x += Math.cos(a) * step; y += Math.sin(a) * step; P.push([x, y]);
    }
    return P;
  }
  function curl(P, sign, rad) {
    const n = P.length, e = P[n - 1], a = Math.atan2(e[1] - P[n - 2][1], e[0] - P[n - 2][0]);
    const c = [e[0] - Math.sin(a) * sign * rad, e[1] + Math.cos(a) * sign * rad];
    const a0 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    for (let i = 1; i <= 14; i++) { const u = i / 14, t = a0 + sign * u * Math.PI * 1.6, rr = rad * (1 - 0.5 * u); P.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]); }
    return P;
  }
  function weave(r, startLayer) {
    const cuts = []; const nc = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nc; i++) cuts.push(0.15 + r() * 0.7);
    cuts.sort((a, b) => a - b);
    const segs = []; let u0 = 0, layer = startLayer;
    for (const c of cuts) {
      if (c <= u0) continue;
      segs.push({ u0, u1: c, layer });
      if (r() < 0.3) { const g = 0.02 + r() * 0.03; u0 = Math.min(0.98, c + g); } else u0 = c;
      layer = 1 - layer;
    }
    segs.push({ u0, u1: 1, layer });
    return segs;
  }
  function layerAt(segs, u) { for (const s of segs) if (u >= s.u0 && u <= s.u1) return s.layer; return segs[segs.length - 1].layer; }

  function wordParams(r, ws) {
    return { roseP: 0.3 + r() * 0.3, leafy: 0.6 + r() * 0.8, lean: (r() - 0.5) * 0.6, big: 0.85 + r() * 0.45, curvy: 0.8 + r() * 0.6, bridgeP: Math.min(0.95, 0.45 + r() * 0.35), w: 0.5 };
  }
  function pickTip(r, p) {
    const u = r(), rp = p.roseP;
    if (u < rp) return 'rose';
    if (u < rp + 0.16) return 'daisy';
    if (u < rp + 0.28) return 'tulip';
    if (u < rp + 0.38) return 'poppy';
    if (u < 0.62) return 'fan';
    if (u < 0.74) return 'leaf';
    return 'curl';
  }
  function grow(r, E, nid, p, o, mw) {
    const tip = o.tip || pickTip(r, p);
    let P = o.pts || vine(o.base, o.dir, o.len, (0.35 + r() * 0.45) * p.curvy, 1 + r() * 1.6, r() * 6.28, (r() - 0.5) * 1.2, 40);
    if (tip === 'curl') P = curl(P, r() < 0.5 ? -1 : 1, 0.05 + r() * 0.05);
    const segs = weave(r, o.layer0 != null ? o.layer0 : (r() < 0.5 ? 0 : 1));
    const dur = Math.max(320, (o.len || 0.8) * 620);
    const thorns = []; const nt = Math.floor(r() * 2.5);
    for (let i = 0; i < nt; i++) thorns.push({ u: 0.15 + r() * 0.65, s: r() < 0.5 ? -1 : 1 });
    E.push({ t: 'stem', id: nid(), pts: P, segs, d0: o.d0, dur, w: o.depth ? 0.82 : 1, thorns });
    const nl = Math.floor(r() * 2.8 * p.leafy);
    let sd = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < nl; i++) {
      const u = 0.25 + r() * 0.6, [q, a] = atPt(P, u); sd = -sd;
      E.push({ t: 'leaf', id: nid(), x: q[0], y: q[1], a: a + sd * (0.55 + r() * 0.5), L: (0.14 + r() * 0.2) * (o.depth ? 0.8 : 1), bend: (r() - 0.5) * 1.2, layer: layerAt(segs, u), d0: o.d0 + dur * u });
    }
    const [tp, ta] = atPt(P, 1), td = o.d0 + dur * 0.8, tl = layerAt(segs, 1);
    const wild = tip === 'daisy' || tip === 'tulip' || tip === 'poppy';
    if (tip === 'rose' || wild) {
      const kind = wild ? tip : 'rose';
      const R = (0.13 + r() * 0.15) * p.big * (o.depth ? 0.75 : 1);
      const over = tp[1] > -0.78 && tp[1] < 0.05 && Math.abs(tp[0]) < p.w * 0.5;
      const layer = over ? (r() < 0.22 ? 1 : 0) : (r() < 0.6 ? 1 : tl);
      E.push({ t: kind, id: nid(), x: tp[0], y: tp[1], R, rot: (r() - 0.5) * 1.0, ph1: r() * 6.28, ph2: r() * 6.28, layer, d0: td });
    } else if (tip === 'fan') {
      const spread = 0.6 + r() * 0.3;
      for (let j = 0; j < 2; j++) E.push({ t: 'leaf', id: nid(), x: tp[0], y: tp[1], a: ta + (j - 0.5) * spread, L: 0.2 + r() * 0.2, bend: (j - 0.5) * 0.8, layer: tl, d0: td + j * 60 });
    } else if (tip === 'leaf') {
      E.push({ t: 'leaf', id: nid(), x: tp[0], y: tp[1], a: ta + (r() - 0.5) * 0.3, L: 0.16 + r() * 0.16, bend: (r() - 0.5), layer: tl, d0: td });
    }
    return P;
  }
  function genLetter(l, seed, mw) {
    const r = rng(seed);
    const p = wordParams(r, l.ws), E = []; let k0 = 0; const nid = () => l.id * 100 + (k0++);
    const w = mw(l.ch), inX = () => (r() - 0.5) * w * 0.7; p.w = w;
    const nUp = 1 + (r() < 0.45 ? 1 : 0);
    for (let i = 0; i < nUp; i++) {
      grow(r, E, nid, p, { base: [inX(), -r() * 0.3], dir: -Math.PI / 2 + p.lean * 0.5 + (r() - 0.5) * 0.7, len: 0.6 + r() * 0.5, d0: 40 + i * 130, tip: l.wi === 0 && i === 0 ? 'rose' : null }, mw);
    }
    if (r() < 0.4) grow(r, E, nid, p, { base: [inX(), -0.1 - r() * 0.35], dir: Math.PI / 2 + (r() - 0.5) * 0.8, len: 0.35 + r() * 0.35, d0: 160 }, mw);
    if (l.prev && r() < p.bridgeP) {
      const px = -(mw(l.prev.ch) + w) / 2;
      const a = [inX(), -0.05 - r() * 0.55], b = [px + (r() - 0.5) * 0.25, -0.05 - r() * 0.55];
      const bulge = (r() < 0.55 ? -1 : 1) * (0.4 + r() * 0.4), dx = b[0] - a[0];
      const P = bez(a, [a[0] + dx * 0.15, a[1] + bulge], [b[0] - dx * 0.15, b[1] + bulge * 0.9], b, 40);
      grow(r, E, nid, p, { pts: P, len: Math.abs(dx) + Math.abs(bulge), d0: 90, tip: ['curl', 'leaf', 'rose', 'daisy', 'tulip', 'poppy'][Math.floor(r() * 6)] }, mw);
    }
    if (l.wi === 0) grow(r, E, nid, p, { base: [-w * 0.3, -0.15 - r() * 0.4], dir: Math.PI + (r() - 0.5) * 1.2, len: 0.45 + r() * 0.3, d0: 120, tip: 'curl' }, mw);
    l.els = E;
  }

  function strokeRange(B, P, a, b, col, w) {
    const n = P.length - 1, ia = a * n, ib = b * n;
    const lerp = t => { const i = Math.min(n - 1, Math.floor(t)), f = t - i; return [P[i][0] + (P[i+1][0] - P[i][0]) * f, P[i][1] + (P[i+1][1] - P[i][1]) * f]; };
    const pts = [lerp(ia)];
    for (let i = Math.floor(ia) + 1; i < ib; i++) pts.push(P[i]);
    pts.push(lerp(ib));
    if (pts.length >= 2) B.stroke(pts, col, w);
  }
  function leaf(B, bx, by, a, L, bend) {
    if (L < 0.5) return;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const ax = u => { const b = Math.sin(Math.PI * u) * bend * 0.15 * L; return [bx + ca * u * L + px * b, by + sa * u * L + py * b]; };
    const hw = u => L * 0.18 * Math.sin(Math.PI * Math.pow(u, 0.8));
    const N = 12, s1 = [], s2 = [];
    for (let i = 0; i <= N; i++) { const u = i / N, c = ax(u), w = hw(u); s1.push([c[0] + px * w, c[1] + py * w]); s2.push([c[0] - px * w, c[1] - py * w]); }
    const tip = ax(1), base = ax(0);
    B.fill([base, ...s1.slice(1, N), tip, tip, ...s2.slice(1, N).reverse(), base], C.blue);
    if (L > 6) { const v = []; for (let i = 0; i <= 8; i++) v.push(ax(0.08 + 0.72 * i / 8)); B.stroke(v, C.vein, Math.max(0.8, L * 0.03)); }
  }
  function rose(B, cx, cy, R, rot, e, a) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (x, y) => [cx + x * cr - y * sr, cy + x * sr + y * cr];
    const P = [
      [0, -0.36, 0.56, 0.54, 0], [-0.5, -0.06, 0.6, 0.6, -0.35], [0.52, -0.06, 0.6, 0.6, 0.35],
      [-0.42, 0.3, 0.62, 0.48, 0.2], [0.47, 0.3, 0.62, 0.48, -0.2], [0.05, 0.42, 0.56, 0.38, 0]
    ];
    const lw = Math.max(0.8, R * 0.045), st = 85, ax0 = 0, ay0 = 0.5;
    P.forEach((q, i) => {
      const s = spr((a - i * st) / 1000, 8, 14); if (s <= 0.001) return;
      const open = (1 - Math.min(1, s)) * (q[0] < 0 ? 0.5 : -0.5), ang = q[4] + open, ca = Math.cos(ang), sa = Math.sin(ang);
      const pt = (th) => {
        const rr = 1 + 0.08 * Math.sin(3 * th + e.ph1 + i) + 0.04 * Math.sin(5 * th + e.ph2);
        const lx = Math.cos(th) * q[2] * rr, ly = Math.sin(th) * q[3] * rr;
        return T((ax0 + (q[0] + lx * ca - ly * sa - ax0) * s) * R, (ay0 + (q[0] * 0 + q[1] + lx * sa + ly * ca - ay0) * s) * R);
      };
      const pts = []; for (let k = 0; k < 26; k++) pts.push(pt(k / 26 * Math.PI * 2));
      B.fill(pts, C.red);
      if (R >= 12 && s > 0.4) {
        const arc = []; for (let k = 0; k <= 14; k++) arc.push(pt(Math.PI * (1.18 + 0.64 * k / 14)));
        strokeRange(B, arc, 0, Math.min(1, (s - 0.4) / 0.5), C.line, lw * 0.8);
      }
    });
    const fr = eo((a - P.length * st - 80) / 520);
    if (fr > 0 && R > 3) {
      const sp = [];
      for (let i = 0; i <= 70; i++) { const u = i / 70, th = e.ph1 + u * 2.4 * Math.PI * 2, rr = R * (0.08 + 0.57 * u); sp.push(T(Math.cos(th) * rr * 1.05, Math.sin(th) * rr * 0.72 - 0.12 * R)); }
      strokeRange(B, sp, 0, fr, C.line, lw);
    }
  }
  function daisy(B, cx, cy, R, rot, e, a) {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const s = spr((a - i * 45) / 1000, 8, 14); if (s <= 0.001) continue;
      const ang = rot + (i / N) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      const L = R * s, Wd = R * 0.30 * s;
      const bx = cx + dx * R * 0.24, by = cy + dy * R * 0.24;
      B.fill([[bx, by], [bx + dx * L * 0.5 + px * Wd, by + dy * L * 0.5 + py * Wd], [cx + dx * (R * 0.24 + L), cy + dy * (R * 0.24 + L)], [bx + dx * L * 0.5 - px * Wd, by + dy * L * 0.5 - py * Wd]], C.red);
    }
    const cs = spr(a / 1000, 8, 14);
    if (cs > 0.001 && R > 2) {
      const disk = [];
      for (let k = 0; k < 20; k++) { const th = k / 20 * Math.PI * 2; disk.push([cx + Math.cos(th) * R * 0.3 * cs, cy + Math.sin(th) * R * 0.3 * cs]); }
      B.fill(disk, C.blue);
    }
  }
  function tulip(B, cx, cy, R, rot, e, a) {
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const P = (lx, ly, s) => [cx + (lx * ca - ly * sa) * R * s, cy + (lx * sa + ly * ca) * R * s];
    [{ dx: -0.42, h: 1.0 }, { dx: 0, h: 1.18 }, { dx: 0.42, h: 1.0 }].forEach((b, i) => {
      const s = spr((a - i * 70) / 1000, 8, 14); if (s <= 0.001) return;
      const hb = b.h * 0.95, hw = 0.30;
      B.fill([P(b.dx - hw * 0.5, 0.5, s), P(b.dx - hw, -0.1, s), P(b.dx - hw * 0.7, -hb * 0.7, s), P(b.dx - hw * 0.25, -hb, s), P(b.dx, -hb * 0.88, s), P(b.dx + hw * 0.25, -hb, s), P(b.dx + hw * 0.7, -hb * 0.7, s), P(b.dx + hw, -0.1, s), P(b.dx + hw * 0.5, 0.5, s)], C.red);
    });
    const s = spr((a - 200) / 1000, 8, 14);
    if (s > 0.4 && R > 4) {
      const vein = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; vein.push(P(0, 0.4 - u * 1.1, s)); }
      strokeRange(B, vein, 0, 1, C.line, Math.max(0.8, R * 0.035));
    }
  }
  function poppy(B, cx, cy, R, rot, e, a) {
    for (let i = 0; i < 4; i++) {
      const s = spr((a - i * 60) / 1000, 8, 14); if (s <= 0.001) continue;
      const ang = rot + (i / 4) * Math.PI * 2;
      const px = cx + Math.cos(ang) * R * 0.42, py = cy + Math.sin(ang) * R * 0.42;
      const pts = [];
      for (let k = 0; k < 22; k++) {
        const th = k / 22 * Math.PI * 2;
        const rr = 1 + 0.1 * Math.sin(2 * th + e.ph1);
        pts.push([px + Math.cos(th) * R * 0.55 * rr * s, py + Math.sin(th) * R * 0.44 * rr * s]);
      }
      B.fill(pts, C.red);
    }
    const cs = spr((a - 120) / 1000, 8, 14);
    if (cs > 0.001 && R > 2) {
      const disk = [];
      for (let k = 0; k < 18; k++) { const th = k / 18 * Math.PI * 2; disk.push([cx + Math.cos(th) * R * 0.26 * cs, cy + Math.sin(th) * R * 0.26 * cs]); }
      B.fill(disk, C.blue);
    }
  }

  // ---------- boot ----------
  const cv = document.getElementById('gardenHero');
  if (!cv) return;
  const g = cv.getContext('2d');
  const B = backend(g);
  const cache = {};
  function mw(ch) {
    if (cache[ch] != null) return cache[ch];
    g.font = `700 100px ${F}`;
    return (cache[ch] = g.measureText(ch).width / 100);
  }
  function layout(W, H) {
    const maxW = W * 0.92;
    const ws = [...WORD].map(mw);
    const unit = ws.reduce((s, w) => s + w, 0);
    const S = Math.min(H * 0.42, maxW / unit);
    let x = W / 2 - (unit * S) / 2;
    const y = H / 2 + 0.1 * S;
    return [...WORD].map((ch, i) => {
      const w = ws[i] * S, l = { ch, id: 100 + i, tx: x + w / 2, ty: y, tw: w, ws: 4242, wi: i, prev: i > 0 ? null : null };
      x += w;
      return l;
    });
  }
  let letters = [], W = 0, H = 0, S = 100, t0 = performance.now(), pointer = null;
  function resize() {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    if (!r.width) return;
    W = r.width; H = r.height;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    const lay = layout(W, H);
    S = Math.min(H * 0.42, (W * 0.92) / lay.reduce((s, l) => s + mw(l.ch), 0));
    letters = lay.map((l, i) => ({ ...l, x: l.tx, y: l.ty, birth: t0 + 150 + i * 110, tb: t0 + 150 + i * 110, els: [] }));
    const rgen = rng(424242);
    for (const l of letters) {
      const E = []; let k0 = 0; const nid = () => l.id * 100 + (k0++);
      const w = mw(l.ch), p = { roseP: 0.35, leafy: 1.0, lean: 0, big: 1.0, curvy: 1.0, bridgeP: 0.6, w };
      const nUp = 2;
      for (let k = 0; k < nUp; k++) {
        grow(rgen, E, nid, p, { base: [(rgen() - 0.5) * w * 0.7, -rgen() * 0.3], dir: -Math.PI / 2 + (rgen() - 0.5) * 0.7, len: 0.6 + rgen() * 0.5, d0: 40 + k * 130, tip: k === 0 ? ['rose', 'daisy', 'tulip', 'poppy'][Math.floor(rgen() * 4)] : null });
      }
      l.els = E;
    }
  }
  function drawEl(e, l, age, f, amp) {
    const j = jit(e.id, f, amp);
    const wpt = (x, y) => [l.x + x * S + j[0], l.y + y * S + j[1]];
    if (e.t === 'leaf') {
      const sc = spr((age - e.d0) / 1000, 7, 15); if (sc <= 0) return;
      const p = wpt(e.x, e.y); leaf(B, p[0], p[1], e.a + j[2], e.L * S * sc, e.bend);
    } else {
      const a = age - e.d0; if (a < 0) return;
      const p = wpt(e.x, e.y);
      const fn = e.t === 'daisy' ? daisy : e.t === 'tulip' ? tulip : e.t === 'poppy' ? poppy : rose;
      fn(B, p[0], p[1], e.R * S, e.rot + j[2], e, a);
    }
  }
  function frame(now) {
    const dt = Math.min(64, now - (frame.lt || now)); frame.lt = now;
    g.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const f = Math.floor(now / 120), amp = Math.max(1.1, S * 0.014);
    const lean = { x: 0, y: 0 };
    if (pointer) {
      const dx = pointer[0] - W / 2, dy = pointer[1] - H / 2;
      lean.x = Math.max(-1, Math.min(1, dx / (W / 2))) * 0.9;
      lean.y = Math.max(-1, Math.min(1, dy / (H / 2))) * 0.5;
    }
    const breeze = 0.12 * Math.sin(now / 2200);
    for (const layer of [0, 1]) {
      for (const l of letters) {
        if (!l.els) continue;
        const age = now - l.birth;
        for (const e of l.els) {
          if (e.t === 'stem') {
            const fr = eo((age - e.d0) / e.dur); if (fr <= 0) continue;
            const P = e.pts.map(p => {
              const hh = Math.max(0, (l.y - (l.y + p[1] * S)) / S);
              return [l.x + p[0] * S + j0(e, f, amp)[0] + (lean.x + breeze) * S * 0.08 * hh, l.y + p[1] * S + j0(e, f, amp)[1]];
            });
            for (const sg of e.segs) {
              if (sg.layer !== layer) continue;
              const b = Math.min(sg.u1, fr); if (b <= sg.u0) continue;
              strokeRange(B, P, sg.u0, b, C.blue, S * 0.022 * (e.w || 1));
            }
            for (const th of e.thorns) {
              if (fr <= th.u) continue;
              const [pp, aa] = atPt(P, th.u), d = aa + th.s * 2.3, L = S * 0.045;
              B.stroke([pp, [pp[0] + Math.cos(d) * L, pp[1] + Math.sin(d) * L]], C.blue, S * 0.022);
            }
          } else if (e.layer === layer) {
            drawEl(e, l, age, f, amp);
          }
        }
      }
    }
    for (const l of letters) B.text(l.ch, l.x, l.y, S, '#FFFFFF');
    function j0(e, f, amp) { return jit(e.id, f, amp); }
    requestAnimationFrame(frame);
  }
  function j0(e, f, amp) { return jit(e.id, f, amp); }
  const hero = document.getElementById('gardenHeroWrap');
  if (hero) {
    hero.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      pointer = [e.clientX - r.left, e.clientY - r.top];
    });
    hero.addEventListener('pointerleave', () => { pointer = null; });
  }
  new ResizeObserver(() => resize()).observe(cv);
  window.addEventListener('resize', resize);
  if (document.fonts) document.fonts.load('700 100px "Playfair Display", Georgia, serif').then(() => resize()).catch(() => {});
  resize();
  requestAnimationFrame(frame);
})();
