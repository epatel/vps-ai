/**
 * Bellman's Lost Epistle — SPA entry point.
 *
 * Hash routes:
 *   #/             — landing: stop list, progress, intro
 *   #/stop/:id     — a single pub: story, puzzle, hint, next-step transition
 *   #/songbook     — verses & keepsakes collected so far
 *   #/finale       — full reconstructed Epistle + sing/bury choice
 *   #/credits      — historical-fact-vs-fiction ledger (from STORY_BIBLE.md §8)
 *
 * QR-code use: each pub displays a QR that links to e.g.
 *   https://yourdomain.example/#/stop/wirstroms
 * which deep-links straight into that stop on a phone.
 *
 * The app is bilingual (English + Swedish). UI chrome strings live in
 * `i18n.js`; per-stop story / verse / puzzle text lives in `stops.js`
 * as `{ en, sv }` objects, read via `pick()` at render time. The footer
 * has a language toggle that re-renders the current view in place.
 */

import { STOPS, TOTAL_STOPS, getStop, FULL_EPISTLE } from './stops.js';
import {
  isCompleted, isUnlocked, completedCount,
  markCompleted, recordAttempt,
  incrementAttempts, getHintLevel, bumpHintLevel,
  awardKeepsake, getKeepsakes, setWitnessNote,
  getFinaleChoice, setFinaleChoice,
  reset as resetState,
} from './state.js';
import { renderPuzzle } from './puzzles.js';
import { el, escapeHtml, roman } from './dom.js';
import { t, pick, pickList, getLocale, setLocale } from './i18n.js';

const app = document.getElementById('app');

/* ---------- router ---------- */

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'stop' && parts[1]) return { name: 'stop', id: parts[1] };
  if (parts[0] === 'songbook') return { name: 'songbook' };
  if (parts[0] === 'finale') return { name: 'finale' };
  if (parts[0] === 'credits') return { name: 'credits' };
  return { name: 'home' };
}

function render() {
  const route = parseHash();
  app.innerHTML = '';
  // Reflect the page title in the current locale.
  try { document.title = t('app.title') + ' — A Pub Walk'; } catch {/* ignore */}
  // Refresh the footer chrome (reset button title, language toggle).
  paintFooter();
  switch (route.name) {
    case 'stop':     return renderStop(route.id);
    case 'songbook': return renderSongbook();
    case 'finale':   return renderFinale();
    case 'credits':  return renderCredits();
    case 'home':
    default:         return renderHome();
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
});

// Re-render in place when the user toggles language.
window.addEventListener('localechange', () => {
  render();
});

/* ---------- views: home ---------- */

function renderHome() {
  const done = completedCount();
  const all = done === TOTAL_STOPS;

  app.appendChild(el('h1', t('app.title')));
  app.appendChild(el('p', t('app.lead'), 'lead'));
  app.appendChild(progressDots(done));

  const intro = el('section', null, 'parchment story');
  intro.innerHTML = `
    <p>${escapeHtml(t('home.intro1'))}</p>
    <p>${escapeHtml(t('home.intro2'))}</p>
    <p>${escapeHtml(t('home.intro3'))}</p>
    <div class="ornament"></div>
    <p style="text-align:center; font-style:italic; color:var(--parchment-dim);">
      ${escapeHtml(all
        ? t('home.allWalked')
        : t('home.tavernsVisited', { done, total: TOTAL_STOPS }))}
    </p>
  `;
  app.appendChild(intro);

  app.appendChild(el('h2', t('home.fiveTaverns')));

  const list = el('ol', null, 'stop-list');
  STOPS.forEach((stop) => {
    const unlocked = isUnlocked(stop.num, STOPS);
    const stopDone = isCompleted(stop.id);

    const item = document.createElement('li');
    const card = document.createElement(unlocked ? 'a' : 'div');
    card.className = 'stop-card' +
      (!unlocked ? ' locked' : '') +
      (stopDone ? ' completed' : '');
    if (unlocked) card.href = `#/stop/${stop.id}`;

    const badge = stopDone ? t('home.visited') : (unlocked ? '' : t('home.locked'));

    card.innerHTML = `
      <span class="num">${roman(stop.num)}</span>
      <span class="title">${escapeHtml(stop.title)}</span>
      <span class="meta">${escapeHtml(stop.address)} — ${escapeHtml(pick(stop.intro))}</span>
      <span class="witness-tag">${escapeHtml(t('home.witness'))}: ${escapeHtml(stop.witness)}</span>
      <span class="badge">${escapeHtml(badge)}</span>
    `;
    item.appendChild(card);
    list.appendChild(item);
  });
  app.appendChild(list);

  // Always-on shortcuts to Songbook & Credits.
  const utils = el('div', null, 'utility-row');
  const sb = el('a', t('home.songbookBtn'), 'btn btn-ghost');
  sb.href = '#/songbook';
  utils.appendChild(sb);
  const cr = el('a', t('home.factsBtn'), 'btn btn-ghost');
  cr.href = '#/credits';
  utils.appendChild(cr);
  app.appendChild(utils);

  if (all) {
    const finale = el('a', t('home.revealBtn'), 'btn btn-block');
    finale.href = '#/finale';
    app.appendChild(finale);
  }
}

/* ---------- views: stop ---------- */

function renderStop(id) {
  const stop = getStop(id);
  if (!stop) {
    app.appendChild(el('h1', t('stop.lostTitle')));
    app.appendChild(el('p', t('stop.lostBody'), 'lead'));
    const back = el('a', t('stop.returnMap'), 'btn btn-ghost');
    back.href = '#/';
    app.appendChild(back);
    return;
  }

  // Header
  const header = el('header', null, 'stop-header');
  header.innerHTML = `
    <span class="stop-num">${escapeHtml(t('stop.heading', { n: roman(stop.num), total: roman(TOTAL_STOPS) }))}</span>
    <h1>${escapeHtml(stop.title)}</h1>
    <p class="pub-meta">${escapeHtml(stop.address)}</p>
    <p class="witness-card">
      <span class="witness-name">${escapeHtml(stop.witness)}</span>
      <span class="witness-beat">${escapeHtml(pick(stop.beat))}</span>
    </p>
  `;
  app.appendChild(header);
  app.appendChild(progressDots(completedCount()));

  // Story panel — character-themed parchment.
  const story = el('section', null,
    'parchment story story--' + slugWitness(stop.witness));
  pick(stop.story).split(/\n\n+/).forEach((para) => {
    story.appendChild(el('p', para.trim()));
  });
  app.appendChild(story);

  // Verse panel — visible from the start (it's the literary payload).
  const verseBox = el('section', null, 'parchment verse-box');
  verseBox.appendChild(el('h2', t('stop.verseHeader', { n: roman(stop.num) })));
  const pre = el('pre', pick(stop.verse), 'verse-text');
  verseBox.appendChild(pre);
  app.appendChild(verseBox);

  // Puzzle panel
  const puzzleSection = el('section', null, 'parchment puzzle');
  puzzleSection.appendChild(el('h2', t('stop.thePuzzle')));

  const puzzleBody = el('div', null, 'puzzle-body');
  puzzleSection.appendChild(puzzleBody);

  // Hint area — one button that progressively reveals.
  const hintRow = el('div', null, 'hint-row');
  const hintArea = el('div', null, 'hint-area');
  const hintBtn = el('button', t('stop.hintBtn'), 'btn btn-ghost');
  hintBtn.type = 'button';
  hintBtn.addEventListener('click', () => {
    const lvl = bumpHintLevel(stop.id);
    showHint(stop, hintArea, lvl);
  });
  hintRow.appendChild(hintBtn);
  hintRow.appendChild(hintArea);
  puzzleSection.appendChild(hintRow);

  // Render the puzzle.
  const alreadySolved = isCompleted(stop.id);
  renderPuzzle(puzzleBody, stop, {
    alreadySolved,
    onSolve: () => handleSolve(stop, puzzleSection),
    onWrong: () => {
      const { hintLevel } = incrementAttempts(stop.id);
      // Auto-surface the new hint level if it changed.
      if (hintLevel >= 1) showHint(stop, hintArea, hintLevel);
    },
  });

  // Surface any pre-existing hint level.
  const existingHintLvl = getHintLevel(stop.id);
  if (existingHintLvl >= 1 && !alreadySolved) showHint(stop, hintArea, existingHintLvl);

  app.appendChild(puzzleSection);

  // If already solved, show next-step block immediately.
  if (alreadySolved) {
    appendNextStep(puzzleSection, stop);
  }

  // Bottom nav
  const nav = el('div', null, 'actions');
  const back = el('a', t('stop.mapBtn'), 'btn btn-ghost');
  back.href = '#/';
  nav.appendChild(back);
  const sb = el('a', t('stop.songbookBtn'), 'btn btn-ghost');
  sb.href = '#/songbook';
  nav.appendChild(sb);
  app.appendChild(nav);
}

function showHint(stop, hintArea, level) {
  hintArea.innerHTML = '';
  const labels = [t('stop.hint1'), t('stop.hint2'), t('stop.hint3')];
  const lvl = Math.min(3, Math.max(1, level));
  const hints = pickList(stop.hints);
  const text = hints[lvl - 1] || '';
  hintArea.appendChild(el('p',
    `${labels[lvl - 1]} — ${text}`,
    'hint hint-' + lvl));
}

function handleSolve(stop, puzzleSection) {
  // Idempotent — repeat solves don't double-award.
  if (!isCompleted(stop.id)) {
    markCompleted(stop.id);
    if (stop.keepsake) awardKeepsake(stop.keepsake);
    // Store the bilingual record verbatim so the language toggle re-renders
    // notes correctly even after the puzzle is solved.
    if (stop.witnessNote) setWitnessNote(stop.id, stop.witnessNote);
    recordAttempt(stop.id, 'solved');
  }
  // Reflect in progress dots.
  const dots = app.querySelector('.progress');
  if (dots) {
    dots.replaceWith(progressDots(completedCount()));
  }
  appendNextStep(puzzleSection, stop);
}

function appendNextStep(puzzleSection, stop) {
  // Avoid duplicating if user re-submits.
  const existing = puzzleSection.querySelector('.next-block');
  if (existing) existing.remove();

  const block = el('div', null, 'parchment next-block');
  if (stop.directions) {
    const next = STOPS.find((s) => s.id === stop.directions.next);
    block.appendChild(el('h3', t('next.verseAdded')));
    if (stop.keepsake) {
      block.appendChild(el('p',
        `${t('next.keepsake')} ${stop.keepsake}`,
        'keepsake-earned'));
    }
    // Narrative direction copy — Bellman-voice
    block.appendChild(el('p', pick(stop.directions.copy), 'directions'));

    if (next) {
      // Next-stop header card
      const meta = el('p', null, 'next-meta');
      meta.innerHTML = `
        <strong>${escapeHtml(t('next.nextStop'))}</strong> ${escapeHtml(next.title)}<br/>
        <span class="next-address">${escapeHtml(next.address)}</span>
      `;
      block.appendChild(meta);

      // Structured walking directions panel
      const w = stop.directions.walking;
      if (w) {
        const walk = el('div', null, 'walking-card');

        const head = el('div', null, 'walking-head');
        const time = el('span', `🚶  ${t('next.minutes', { n: w.minutes })}`, 'walking-time');
        head.appendChild(time);
        if (w.distance) head.appendChild(el('span', w.distance, 'walking-dist'));
        if (w.crossing) head.appendChild(el('span', pick(w.crossing), 'walking-cross'));
        walk.appendChild(head);

        const steps = pick(w.steps);
        if (Array.isArray(steps) && steps.length) {
          const ol = el('ol', null, 'walking-steps');
          steps.forEach((s) => ol.appendChild(el('li', s)));
          walk.appendChild(ol);
        }

        if (w.landmark) {
          const lm = el('p', null, 'walking-landmark');
          lm.innerHTML = `<strong>${escapeHtml(t('next.landmark'))}</strong> ${escapeHtml(pick(w.landmark))}`;
          walk.appendChild(lm);
        }
        if (w.note) {
          walk.appendChild(el('p', pick(w.note), 'walking-note'));
        }

        // Maps deep links — both ecosystems
        const mapsRow = el('div', null, 'walking-maps');
        const gmaps = el('a', t('next.googleMaps'), 'btn btn-ghost btn-sm');
        gmaps.href = w.google ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.mapsQuery)}`;
        gmaps.target = '_blank';
        gmaps.rel = 'noopener noreferrer';
        mapsRow.appendChild(gmaps);

        const amaps = el('a', t('next.appleMaps'), 'btn btn-ghost btn-sm');
        amaps.href = w.apple ||
          `https://maps.apple.com/?q=${encodeURIComponent(next.mapsQuery)}&dirflg=w`;
        amaps.target = '_blank';
        amaps.rel = 'noopener noreferrer';
        mapsRow.appendChild(amaps);
        walk.appendChild(mapsRow);

        block.appendChild(walk);
      } else {
        // Fallback for any stop without a walking block
        const row = el('div', null, 'actions');
        const mapBtn = el('a', t('next.openMaps'), 'btn btn-ghost');
        mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.mapsQuery)}`;
        mapBtn.target = '_blank';
        mapBtn.rel = 'noopener noreferrer';
        row.appendChild(mapBtn);
        block.appendChild(row);
      }

      // Reassuring "scan-the-next-QR works too" note + onward button
      block.appendChild(el('p', t('next.qrNote'), 'walking-qr-note'));

      const onward = el('div', null, 'actions');
      const goBtn = el('a',
        t('next.onward', { title: next.title }),
        'btn btn-block');
      goBtn.href = `#/stop/${next.id}`;
      onward.appendChild(goBtn);
      block.appendChild(onward);
    }
  } else {
    // Stop 5 — link to finale.
    block.appendChild(el('h3', t('next.versesWhole')));
    if (stop.keepsake) {
      block.appendChild(el('p',
        `${t('next.keepsake')} ${stop.keepsake}`,
        'keepsake-earned'));
    }
    const finaleLink = el('a', t('next.toReckoning'), 'btn btn-block');
    finaleLink.href = '#/finale';
    block.appendChild(finaleLink);
  }
  puzzleSection.appendChild(block);
}

/* ---------- views: songbook ---------- */

function renderSongbook() {
  app.appendChild(el('h1', t('songbook.title')));
  app.appendChild(el('p', t('songbook.lead'), 'lead'));

  const keepsakes = getKeepsakes();
  const tray = el('section', null, 'parchment keepsake-section');
  tray.appendChild(el('h2', t('songbook.clueTray')));
  if (keepsakes.length === 0) {
    tray.appendChild(el('p', t('songbook.noKeepsakes')));
  } else {
    const chips = el('div', null, 'keepsake-tray');
    keepsakes.forEach((k) => {
      const chip = el('span', k, 'keepsake-chip static');
      chips.appendChild(chip);
    });
    tray.appendChild(chips);
  }
  app.appendChild(tray);

  app.appendChild(el('h2', t('songbook.collected')));
  const verses = el('section', null, 'parchment songbook');
  let any = false;
  STOPS.forEach((stop) => {
    if (!isCompleted(stop.id)) return;
    any = true;
    verses.appendChild(el('h3', `${roman(stop.num)}. ${stop.title}`));
    verses.appendChild(el('pre', pick(stop.verse), 'verse-text'));
  });
  if (!any) {
    verses.appendChild(el('p', t('songbook.noVerses')));
  }
  app.appendChild(verses);

  const back = el('a', t('stop.mapBtn'), 'btn btn-ghost');
  back.href = '#/';
  app.appendChild(back);
}

/* ---------- views: finale ---------- */

function renderFinale() {
  app.appendChild(el('h1', t('finale.title')));
  app.appendChild(el('p', t('finale.lead'), 'lead'));
  app.appendChild(progressDots(completedCount()));

  // Broadside — the full reconstructed epistle.
  const broadside = el('section', null, 'parchment broadside');
  broadside.innerHTML = `
    <h2 class="broadside-title">${escapeHtml(FULL_EPISTLE.title)}</h2>
    <p class="broadside-subtitle">${escapeHtml(pick(FULL_EPISTLE.subtitle))}</p>
    <div class="ornament"></div>
  `;
  FULL_EPISTLE.verses.forEach((v, i) => {
    const verseEl = el('div', null, 'broadside-verse');
    verseEl.appendChild(el('h3', t('stop.verseHeader', { n: roman(i + 1) })));
    verseEl.appendChild(el('pre', pick(v), 'verse-text'));
    broadside.appendChild(verseEl);
  });
  broadside.appendChild(el('div', null, 'ornament'));
  broadside.appendChild(el('pre', pick(FULL_EPISTLE.closing), 'closing-text'));
  app.appendChild(broadside);

  // Player choice.
  const choice = getFinaleChoice();
  if (!choice) {
    const choiceBox = el('section', null, 'parchment choice-box');
    choiceBox.appendChild(el('h2', t('finale.choiceTitle')));
    choiceBox.appendChild(el('p', t('finale.choiceLead'), 'lead'));
    const row = el('div', null, 'actions');

    const sing = el('button', t('finale.sing'), 'btn');
    sing.type = 'button';
    sing.addEventListener('click', () => {
      setFinaleChoice('sing');
      render();
    });
    row.appendChild(sing);

    const bury = el('button', t('finale.bury'), 'btn btn-ghost');
    bury.type = 'button';
    bury.addEventListener('click', () => {
      setFinaleChoice('bury');
      render();
    });
    row.appendChild(bury);

    choiceBox.appendChild(row);
    app.appendChild(choiceBox);
  } else {
    const ending = el('section', null, 'parchment ending');
    if (choice === 'sing') {
      ending.innerHTML = `
        <h2>${escapeHtml(t('finale.sangH'))}</h2>
        <p>${t('finale.sangP1')}</p>
        <p class="closing">${escapeHtml(t('finale.sangP2'))}</p>
      `;
    } else {
      ending.innerHTML = `
        <h2>${escapeHtml(t('finale.buriedH'))}</h2>
        <p>${t('finale.buriedP1')}</p>
        <p class="closing">${escapeHtml(t('finale.buriedP2'))}</p>
      `;
    }
    ending.appendChild(el('div', null, 'ornament'));
    ending.appendChild(el('pre', pick(FULL_EPISTLE.closing), 'closing-text'));
    app.appendChild(ending);

    // Skål screen
    const skal = el('section', null, 'parchment skal');
    skal.innerHTML = `
      <h2>${escapeHtml(t('finale.skalH'))}</h2>
      <p>${escapeHtml(t('finale.skalP1'))}</p>
      <p style="text-align:center; font-style:italic; margin-top: 1.5rem;">${escapeHtml(t('finale.skalP2'))}</p>
    `;
    app.appendChild(skal);

    // Allow re-choosing (charm of replay).
    const reChoice = el('button', t('finale.reconsider'), 'link-btn');
    reChoice.type = 'button';
    reChoice.addEventListener('click', () => {
      setFinaleChoice(null);
      render();
    });
    app.appendChild(reChoice);
  }

  const row2 = el('div', null, 'actions');
  const sb = el('a', t('stop.songbookBtn'), 'btn btn-ghost');
  sb.href = '#/songbook';
  row2.appendChild(sb);
  const cr = el('a', t('home.factsBtn'), 'btn btn-ghost');
  cr.href = '#/credits';
  row2.appendChild(cr);
  const back = el('a', t('stop.mapBtn'), 'btn btn-ghost');
  back.href = '#/';
  row2.appendChild(back);
  app.appendChild(row2);
}

/* ---------- views: credits ---------- */

function renderCredits() {
  app.appendChild(el('h1', t('credits.title')));
  app.appendChild(el('p', t('credits.lead'), 'lead'));

  const realList = t('credits.realList');
  const real = el('section', null, 'parchment story');
  real.innerHTML = `
    <h2>${escapeHtml(t('credits.realH'))}</h2>
    <ul>
      ${(Array.isArray(realList) ? realList : []).map((li) => `<li>${li}</li>`).join('')}
    </ul>
  `;
  app.appendChild(real);

  const invList = t('credits.inventedList');
  const fic = el('section', null, 'parchment story');
  fic.innerHTML = `
    <h2>${escapeHtml(t('credits.inventedH'))}</h2>
    <ul>
      ${(Array.isArray(invList) ? invList : []).map((li) => `<li>${li}</li>`).join('')}
    </ul>
    <p style="font-style:italic; color:var(--parchment-dim); margin-top: 1rem;">
      ${escapeHtml(t('credits.disclaimer'))}
    </p>
  `;
  app.appendChild(fic);

  const back = el('a', t('stop.mapBtn'), 'btn btn-ghost');
  back.href = '#/';
  app.appendChild(back);
}

/* ---------- shared bits ---------- */

function progressDots(done) {
  const wrap = el('div', null, 'progress');
  wrap.setAttribute('aria-label', `Progress: ${done} of ${TOTAL_STOPS} taverns visited`);
  for (let i = 0; i < TOTAL_STOPS; i++) {
    const pip = el('span', '', 'pip' + (i < done ? ' done' : ''));
    wrap.appendChild(pip);
  }
  return wrap;
}

function slugWitness(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* ---------- footer (reset + language toggle) ---------- */

function paintFooter() {
  // Reset button text + tooltip
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.textContent = t('footer.reset');
    resetBtn.title = t('footer.resetTitle');
  }
  // Footer location text
  const locText = document.querySelector('.footer-text');
  if (locText) locText.textContent = t('footer.location');
  // Language toggle — paint active state
  const langWrap = document.getElementById('lang-toggle');
  if (langWrap) {
    const cur = getLocale();
    langWrap.querySelectorAll('button[data-lang]').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === cur);
      b.setAttribute('aria-pressed', b.dataset.lang === cur ? 'true' : 'false');
    });
    langWrap.setAttribute('aria-label', t('footer.langLabel'));
  }
}

/* ---------- reset ---------- */

document.getElementById('reset-btn')?.addEventListener('click', () => {
  if (!confirm(t('footer.confirmReset'))) return;
  resetState();
  if (location.hash && location.hash !== '#/') {
    location.hash = '#/';
  } else {
    render();
  }
});

// Wire up language toggle buttons (created in index.html).
document.querySelectorAll('#lang-toggle button[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => setLocale(btn.dataset.lang));
});

/* ---------- boot ---------- */

render();
