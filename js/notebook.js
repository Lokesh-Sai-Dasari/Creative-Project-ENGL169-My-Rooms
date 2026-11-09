/* The notebook — the loading page for every room. A sheet of ruled paper; a pencil writes the room's name, underlines it,
   then lists everything the room holds, line by line. All motion is transform/opacity (Web Animations), so it keeps
   running on the compositor while the room is being built on the main thread. The sound is scheduled by the caller. */
(function () {
  'use strict';
  const N = window.NOTE = {};

  // what each room holds, in the order the pencil writes it
  N.LISTS = {
    bedroom: { title: 'My Bedroom', items: [
      '1 bed, with spotted sheets',
      '1 light brown desk',
      '1 black gaming setup',
      '1 controller',
      '1 stack of study books',
      '1 gaming chair',
      '1 mini-fridge',
      '1 guitar, on the wall',
      '1 pool cue, beside it',
      '1 shelf of folded clothes',
      '1 mirror',
      '1 window',
      '1 door',
      '1 granite floor'
    ] },
    kitchen: { title: 'The Kitchen', items: [
      '1 big fridge, with magnets',
      '1 freezer, 1 can of cola',
      '1 black stone counter, L-shaped',
      '1 sink, at the tip of the L',
      '1 gas stove, 2 burners',
      '1 steel chimney hood',
      'navy tiles along the counter',
      'cabinets and drawers',
      '1 kettle, 1 roll of paper towels',
      '1 cutting board',
      'my mom, cutting vegetables',
      '1 window, 1 door',
      '1 marble floor'
    ] },
    pool: { title: 'The Pool Room', items: [
      '1 green pool table',
      'a few balls, scattered',
      '1 cue rack',
      '2 dim yellow lights',
      '1 closet, closed',
      '1 chair',
      '1 boom box, on the chair',
      'my friend, lining up a shot',
      '1 door',
      'jazz, when it plays'
    ] },
    campfire: { title: 'The Campfire', items: [
      '1 patch of ground',
      '1 wooden log',
      'me, with my guitar',
      '1 girl, beside me',
      '1 fire',
      '4 marshmallows on sticks',
      'a few plants',
      'fireflies',
      '1 night sky, 1 moon',
      'and then nothing: the void'
    ] }
  };

  const PENCIL_SVG = '<svg viewBox="-2 -12 190 24" width="190" height="24" aria-hidden="true">' +
    '<defs><linearGradient id="pb" x1="0" y1="-7" x2="0" y2="7" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f7d454"/><stop offset="0.45" stop-color="#f2bf25"/><stop offset="1" stop-color="#c9930f"/></linearGradient>' +
    '<linearGradient id="pf" x1="0" y1="-7" x2="0" y2="7" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#eee"/><stop offset="0.5" stop-color="#b9b9b9"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>' +
    '<path d="M0 0 L9 -2.6 L9 2.6 Z" fill="#2c2d30"/>' +
    '<path d="M9 -2.6 L30 -7 L30 7 L9 2.6 Z" fill="#e7c18f"/><path d="M9 0.6 L30 2 L30 7 L9 2.6 Z" fill="#cf9f68"/>' +
    '<path d="M30 -7 Q31.5 -4.5 30 -2.3 Q31.5 0 30 2.3 Q31.5 4.5 30 7 L150 7 L150 -7 Z" fill="url(#pb)"/>' +
    '<rect x="30" y="-2.2" width="120" height="1.2" fill="#d9a417" opacity="0.7"/><rect x="30" y="2.6" width="120" height="1" fill="#b88710" opacity="0.6"/>' +
    '<rect x="150" y="-7.3" width="16" height="14.6" fill="url(#pf)"/><rect x="154" y="-7.3" width="1.2" height="14.6" fill="#888"/><rect x="161" y="-7.3" width="1.2" height="14.6" fill="#888"/>' +
    '<path d="M166 -7 L179 -7 Q184 -7 184 0 Q184 7 179 7 L166 7 Z" fill="#e98b98"/><path d="M166 2 L181 2 Q183 5 179 7 L166 7 Z" fill="#c96d7b"/>' +
    '</svg>';

  let book, ink, pencilEl, promptEl, opened = false, skipFn = null;
  function el(tag, cls, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function ensure() {
    if (book) return;
    book = document.getElementById('book');
    if (!book) { book = el('div', '', document.body); book.id = 'book'; }
    book.innerHTML = '';
    el('div', 'holes', book);
    ink = el('div', 'ink', book);
    el('div', 'grain', book);
    promptEl = el('div', 'prompt', book);
    pencilEl = el('div', 'pencil', book); pencilEl.innerHTML = '<div class="tilt">' + PENCIL_SVG + '</div>';
    book.addEventListener('click', () => { if (skipFn) skipFn(); });
    window.addEventListener('keydown', e => { if (opened && skipFn && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) skipFn(); });
  }
  // the grid: line height from the screen, so the whole list fits on one page
  function geom(rows) {
    const h = innerHeight, w = innerWidth;
    const lh = Math.max(22, Math.min(46, (h - 20) / (rows + 3.2)));
    const top = Math.round(lh * 2.1);
    const margin = Math.round(Math.max(44, Math.min(110, w * 0.1)));
    return { lh: Math.round(lh), top, margin, x: margin + Math.round(lh * 0.45), w };
  }
  function layoutPaper(g) {
    book.style.setProperty('--lh', g.lh + 'px'); book.style.setProperty('--top', g.top + 'px'); book.style.setProperty('--margin', g.margin + 'px'); book.style.setProperty('--ps', (g.lh / 36).toFixed(3));
  }

  N.isOpen = () => opened;
  N.open = function (rows) {
    ensure(); opened = true; skipFn = null;
    layoutPaper(geom(rows || 15));
    ink.innerHTML = ''; promptEl.textContent = ''; pencilEl.getAnimations().forEach(a => a.cancel()); pencilEl.style.opacity = '0';
    book.getAnimations().forEach(a => a.cancel());
    book.hidden = false; book.style.opacity = '1';
    book.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  };
  N.close = function () {
    return new Promise(res => {
      if (!book || book.hidden) { opened = false; return res(); }
      skipFn = null;
      const a = book.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = () => { book.hidden = true; a.cancel(); book.style.opacity = '1'; opened = false; ink.innerHTML = ''; res(); };
    });
  };
  // before anything can make a sound, the browser needs one click or key press: a quiet pencilled invitation
  N.gate = function (text) {
    ensure();
    promptEl.textContent = text;
    promptEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 300, fill: 'backwards' });
    return new Promise(res => {
      const go = () => { window.removeEventListener('keydown', go, true); book.removeEventListener('pointerdown', go); promptEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }); setTimeout(res, 120); };
      window.addEventListener('keydown', go, true); book.addEventListener('pointerdown', go);
    });
  };

  // write the title, underline it, then each line. `sound(delaySeconds, durationSeconds, kind)` is called for every stroke.
  N.write = function (title, items, sound) {
    ensure();
    const g = geom(items.length + 2), lh = g.lh;
    layoutPaper(g);
    ink.innerHTML = '';
    const maxW = innerWidth - g.x - 18;
    // the writing shrinks on a narrow screen so the longest line still fits
    const longest = items.reduce((m, t) => Math.max(m, t.length), title.length * 1.4);
    book.style.setProperty('--fs', Math.max(14, Math.min(lh * 0.95, maxW / (longest * 0.46))).toFixed(1) + 'px');
    const rows = [];
    // row 0: the title (bigger); row 1 is left blank; the list starts on row 2
    const all = [{ text: title, title: true, row: 0 }].concat(items.map((t, i) => ({ text: t, row: i + 2 })));
    all.forEach(it => {
      const r = el('div', 'row' + (it.title ? ' title' : ''), ink);
      r.style.top = (g.top + it.row * lh - (it.title ? Math.round(lh * 0.35) : 0)) + 'px';
      r.style.left = g.x + 'px'; r.style.height = (lh + (it.title ? Math.round(lh * 0.35) : 0) - 2) + 'px'; r.style.maxWidth = maxW + 'px';
      const t = el('span', 't', r); t.textContent = it.text;
      const c = el('div', 'cover', r);
      rows.push({ it, r, t, c });
    });
    // measure, then build the timeline
    let t = 0.45; const keys = [], pts = [];
    const startX = g.x, baseY = row => g.top + (row + 1) * lh - Math.round(lh * 0.28);
    pts.push({ t: 0, x: innerWidth * 0.82, y: innerHeight * 0.92, o: 0 });
    pts.push({ t: 0.35, x: startX, y: baseY(0) - lh * 0.4, o: 1 });
    rows.forEach((o, i) => {
      const w = Math.min(maxW, o.t.getBoundingClientRect().width), y = baseY(o.it.row) - (o.it.title ? lh * 0.06 : 0);
      o.c.style.width = (w + 14) + 'px';
      const dur = Math.max(0.32, o.it.text.length * (o.it.title ? 0.075 : 0.034));
      // the pencil: down onto the line, along it with a little wobble
      pts.push({ t: t, x: startX, y: y, o: 1 });
      const n = Math.max(3, Math.round(dur * 9));
      for (let k = 1; k <= n; k++) { const u = k / n; pts.push({ t: t + dur * u, x: startX + w * u, y: y + (k % 2 ? -1 : 1) * lh * 0.09 * (k === n ? 0 : 1), o: 1 }); }
      o.c.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (w + 16) + 'px)' }], { duration: dur * 1000, delay: t * 1000, easing: 'linear', fill: 'both' });
      if (sound) sound(t, dur, o.it.title ? 'title' : 'line');
      t += dur;
      if (o.it.title) {
        // the underline, drawn back from the end of the word to its start
        const u = el('div', 'under', o.r); u.style.width = (w + 10) + 'px';
        const ud = 0.42; t += 0.12;
        pts.push({ t: t, x: startX + w + 6, y: y + lh * 0.2, o: 1 });
        u.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ud * 1000, delay: t * 1000, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
        pts.push({ t: t + ud, x: startX - 4, y: y + lh * 0.24, o: 1 });
        if (sound) sound(t, ud, 'underline');
        t += ud;
      }
      // lift and travel to the next line
      const lift = i < rows.length - 1 ? 0.2 : 0;
      if (lift) { pts.push({ t: t + lift * 0.5, x: (startX + startX + w) / 2, y: y + lh * 0.2, o: 1 }); t += lift; }
    });
    const end = t;
    pts.push({ t: end + 0.5, x: Math.min(innerWidth - 60, startX + 260), y: innerHeight * 0.9, o: 0 });
    const total = end + 0.5;
    const frames = pts.map(p => ({ transform: 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)', opacity: p.o, offset: Math.min(1, p.t / total) }));
    // offsets must not decrease
    for (let i = 1; i < frames.length; i++) if (frames[i].offset < frames[i - 1].offset) frames[i].offset = frames[i - 1].offset;
    pencilEl.style.opacity = '';
    pencilEl.animate(frames, { duration: total * 1000, easing: 'linear', fill: 'both' });

    let canSkip = false, resolve;
    const done = new Promise(r => { resolve = r; });
    const timer = setTimeout(() => resolve('written'), (end + 0.75) * 1000);
    skipFn = () => { if (!canSkip) return; clearTimeout(timer); resolve('skipped'); };
    return { total: end, done, allowSkip() { setTimeout(() => { canSkip = true; }, 900); } };
  };
})();
