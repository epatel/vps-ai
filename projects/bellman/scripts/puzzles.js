/**
 * Puzzle renderers — one per mechanic in PUZZLE_DESIGN.md §0.
 *
 * Each renderer is invoked with:
 *   container — DOM node to render into
 *   stop      — the full stop object (translatable fields are { en, sv })
 *   onSolve   — () => void; called when the puzzle is solved (idempotent-safe;
 *               this module guards by checking `isCompleted`)
 *   onWrong   — (msg?) => void; called for a wrong submission (the caller
 *               increments attempts and may auto-surface a hint)
 *   alreadySolved — boolean; if true, render in a "solved" read-only state.
 *
 * No puzzle here writes directly to game state — the caller (app.js) decides
 * what counts as success and persists it. This keeps mechanics decoupled
 * from the storage layer.
 *
 * All user-facing strings come from either the stop's bilingual `{ en, sv }`
 * fields (read via `pick()`) or the UI table (read via `t()`).
 */

import { el, escapeHtml } from './dom.js';
import {
  getStop1Step, setStop1Step,
  getKeepsakes, hasKeepsake, awardKeepsake,
  getWitnessNotes,
} from './state.js';
import { pick, pickList, t } from './i18n.js';

/* =========================================================================
   Dispatcher
   ========================================================================= */

export function renderPuzzle(container, stop, callbacks) {
  const { type } = stop.puzzle;
  switch (type) {
    case 'multi-step':  return renderMultiStep(container, stop, callbacks);
    case 'reorder':     return renderReorder(container, stop, callbacks);
    case 'shield':      return renderShield(container, stop, callbacks);
    case 'acrostic':    return renderAcrostic(container, stop, callbacks);
    case 'fill-blanks': return renderFillBlanks(container, stop, callbacks);
    default:
      container.appendChild(el('p', `${t('puzzle.unknownType')} ${type}`));
  }
}

/* =========================================================================
   Stop 1 — multi-step (multi-choice trivia, then photo observation)
   ========================================================================= */

function renderMultiStep(container, stop, { onSolve, onWrong, alreadySolved }) {
  const steps = stop.puzzle.steps;
  // If solved, show both steps as completed.
  let stepIdx = alreadySolved ? steps.length : getStop1Step();
  if (stepIdx > steps.length) stepIdx = steps.length;

  const wrap = el('div', null, 'multi-step');

  // Render each step — completed ones are dimmed, current one is interactive,
  // future ones are hidden until reached.
  steps.forEach((step, i) => {
    if (i > stepIdx) return;
    const block = el('div', null,
      'step ' + (i < stepIdx ? 'step-done' : 'step-active'));
    block.appendChild(el('h3', `Step ${String.fromCharCode(65 + i)}`));
    block.appendChild(el('p', pick(step.prompt), 'puzzle-prompt'));

    if (step.type === 'multi-choice') {
      renderMultiChoice(block, step, i < stepIdx, () => advance(i));
    } else if (step.type === 'observation') {
      renderObservation(block, step, i < stepIdx, () => advance(i));
    }
    wrap.appendChild(block);
  });

  container.appendChild(wrap);

  function advance(stepIndex) {
    const next = stepIndex + 1;
    setStop1Step(next);
    if (next >= steps.length) {
      onSolve();
    } else {
      // Re-render this puzzle to show the next step.
      container.innerHTML = '';
      renderMultiStep(container, stop, { onSolve, onWrong, alreadySolved: false });
    }
  }

  function renderMultiChoice(block, step, isDone, onCorrect) {
    const list = el('div', null, 'choice-list');
    step.options.forEach((opt, i) => {
      const btn = el('button', opt, 'choice-btn');
      btn.type = 'button';
      if (isDone) {
        btn.disabled = true;
        if (i === step.answerIndex) btn.classList.add('correct');
      }
      btn.addEventListener('click', () => {
        if (i === step.answerIndex) {
          [...list.children].forEach((c) => { c.disabled = true; });
          btn.classList.add('correct');
          flashFeedback(block, pick(step.rightQuip), 'correct');
          setTimeout(onCorrect, 700);
        } else {
          btn.classList.add('wrong');
          flashFeedback(block, pick(step.wrongQuip) || 'No.', 'wrong');
          onWrong();
          // Re-enable after a beat so the player can retry.
          setTimeout(() => btn.classList.remove('wrong'), 600);
        }
      });
      list.appendChild(btn);
    });
    block.appendChild(list);
  }

  function renderObservation(block, step, isDone, onCorrect) {
    const grid = el('div', null, 'photo-grid');
    step.options.forEach((opt) => {
      const tile = el('button', null, 'photo-tile');
      tile.type = 'button';
      tile.innerHTML = `
        <span class="photo-glyph" aria-hidden="true">${opt.glyph}</span>
        <span class="photo-label">${escapeHtml(pick(opt.label))}</span>
      `;
      if (isDone) {
        tile.disabled = true;
        if (opt.id === step.answerId) tile.classList.add('correct');
      }
      tile.addEventListener('click', () => {
        if (opt.id === step.answerId) {
          [...grid.children].forEach((c) => { c.disabled = true; });
          tile.classList.add('correct');
          flashFeedback(block, pick(step.rightQuip), 'correct');
          setTimeout(onCorrect, 700);
        } else {
          tile.classList.add('wrong');
          flashFeedback(block, pick(step.wrongQuip) || 'No — look again.', 'wrong');
          onWrong();
          setTimeout(() => tile.classList.remove('wrong'), 600);
        }
      });
      grid.appendChild(tile);
    });
    block.appendChild(grid);
  }
}

/* =========================================================================
   Stop 2 — drag/tap to reorder verse lines
   ========================================================================= */

function renderReorder(container, stop, { onSolve, onWrong, alreadySolved }) {
  const { displayOrder } = stop.puzzle;
  const correctOrder = pick(stop.puzzle.correctOrder);
  const prompt = pick(stop.puzzle.prompt);
  const successMsg = pick(stop.puzzle.successMsg);

  container.appendChild(el('p', prompt, 'puzzle-prompt'));

  // If already solved, just show the verse in order.
  if (alreadySolved) {
    const list = el('ol', null, 'verse-locked');
    correctOrder.forEach((line) => list.appendChild(el('li', line)));
    container.appendChild(list);
    return;
  }

  // Working state — start in the deterministic shuffled order.
  let order = displayOrder.map((i) => correctOrder[i]);

  const list = el('ul', null, 'reorder-list');
  list.setAttribute('aria-label', 'Reorder these lines');

  function paint() {
    list.innerHTML = '';
    order.forEach((line, idx) => {
      const li = el('li', null, 'reorder-item');
      li.innerHTML = `
        <span class="reorder-handle" aria-hidden="true">≡</span>
        <span class="reorder-text">${escapeHtml(line)}</span>
        <span class="reorder-controls">
          <button type="button" class="rbtn" data-act="up"   aria-label="Move up"   ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="rbtn" data-act="down" aria-label="Move down" ${idx === order.length - 1 ? 'disabled' : ''}>▼</button>
        </span>
      `;
      li.querySelectorAll('.rbtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          if (act === 'up' && idx > 0) {
            [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
          } else if (act === 'down' && idx < order.length - 1) {
            [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
          }
          paint();
        });
      });
      list.appendChild(li);
    });
  }
  paint();
  container.appendChild(list);

  const submit = el('button', t('puzzle.readAloud'), 'btn');
  submit.type = 'button';
  submit.addEventListener('click', () => {
    const matches = order.every((line, i) => line === correctOrder[i]);
    if (matches) {
      flashFeedback(container, successMsg, 'correct');
      submit.disabled = true;
      onSolve();
    } else {
      flashFeedback(container, t('puzzle.reorderWrong'), 'wrong');
      onWrong();
    }
  });
  container.appendChild(submit);
}

/* =========================================================================
   Stop 3 — tap the right shield
   ========================================================================= */

function renderShield(container, stop, { onSolve, onWrong, alreadySolved }) {
  const { shields, answerId } = stop.puzzle;
  const prompt = pick(stop.puzzle.prompt);
  const successMsg = pick(stop.puzzle.successMsg);
  const wrongQuip = pick(stop.puzzle.wrongQuip);

  container.appendChild(el('p', prompt, 'puzzle-prompt'));

  const grid = el('div', null, 'shield-grid');
  shields.forEach((shield) => {
    const tile = el('button', null, 'shield-tile');
    tile.type = 'button';
    tile.innerHTML = `
      ${shieldSvg(shield)}
      <span class="shield-id">${escapeHtml(shield.id)}</span>
      <span class="shield-label">${escapeHtml(pick(shield.label))}</span>
    `;
    if (alreadySolved && shield.id === answerId) tile.classList.add('correct');
    if (alreadySolved) tile.disabled = true;

    tile.addEventListener('click', () => {
      if (shield.id === answerId) {
        [...grid.children].forEach((c) => { c.disabled = true; });
        tile.classList.add('correct');
        flashFeedback(container, successMsg, 'correct');
        onSolve();
      } else {
        tile.classList.add('wrong');
        flashFeedback(container, wrongQuip || 'Re-read the verse.', 'wrong');
        onWrong();
        setTimeout(() => tile.classList.remove('wrong'), 600);
      }
    });
    grid.appendChild(tile);
  });
  container.appendChild(grid);
}

/**
 * Mini hand-drawn-feel SVG shield. The `figures` value selects what
 * to draw on the field; `field` is the background colour, `metal` the
 * tincture of the figures.
 */
function shieldSvg(s) {
  const w = 120, h = 140;
  const shieldPath =
    `M${w/2},${h-8}
     C ${w*0.85},${h-30} ${w-6},${h*0.55} ${w-6},${h*0.25}
     L ${w-6},6 L 6,6 L 6,${h*0.25}
     C 6,${h*0.55} ${w*0.15},${h-30} ${w/2},${h-8} Z`;

  const figures = drawFigures(s.figures, w, h, s.metal);

  return `
    <svg viewBox="0 0 ${w} ${h}" class="shield-svg" aria-hidden="true">
      <defs>
        <clipPath id="cp-${s.id}"><path d="${shieldPath}"/></clipPath>
      </defs>
      <path d="${shieldPath}" fill="${s.field}" stroke="#1a0f08" stroke-width="2"/>
      <g clip-path="url(#cp-${s.id})">${figures}</g>
      <path d="${shieldPath}" fill="none" stroke="#c9a64a" stroke-width="1.5" opacity="0.7"/>
    </svg>
  `;
}

function drawFigures(kind, w, h, metal) {
  if (kind === 'fish-3') {
    // Three stacked fish, slightly stylized.
    const fish = (cy) => `
      <g transform="translate(${w/2}, ${cy})" fill="${metal}">
        <ellipse cx="0" cy="0" rx="22" ry="7"/>
        <polygon points="22,0 32,-8 32,8"/>
        <circle cx="-12" cy="-2" r="1.6" fill="#1a0f08"/>
      </g>
    `;
    return fish(h*0.30) + fish(h*0.50) + fish(h*0.70);
  }
  if (kind === 'lions-2') {
    const lion = (cx) => `
      <g transform="translate(${cx}, ${h*0.55})" fill="${metal}">
        <circle cx="0" cy="-10" r="9"/>
        <rect x="-4" y="-2" width="20" height="10" rx="3"/>
        <rect x="-3" y="8" width="3" height="8"/>
        <rect x="13" y="8" width="3" height="8"/>
        <polygon points="16,-2 22,-6 22,2"/>
      </g>
    `;
    return lion(w*0.32) + lion(w*0.68);
  }
  if (kind === 'crown-sword') {
    return `
      <g fill="${metal}">
        <!-- crown -->
        <polygon points="${w*0.30},${h*0.30} ${w*0.40},${h*0.18} ${w*0.50},${h*0.30} ${w*0.60},${h*0.18} ${w*0.70},${h*0.30} ${w*0.70},${h*0.40} ${w*0.30},${h*0.40}"/>
        <!-- sword -->
        <rect x="${w*0.485}" y="${h*0.48}" width="3" height="32"/>
        <rect x="${w*0.46}"  y="${h*0.46}" width="9" height="3"/>
        <polygon points="${w*0.50},${h*0.83} ${w*0.46},${h*0.78} ${w*0.54},${h*0.78}"/>
      </g>
    `;
  }
  return '';
}

/* =========================================================================
   Stop 4 — acrostic cipher
   ========================================================================= */

function renderAcrostic(container, stop, { onSolve, onWrong, alreadySolved }) {
  const { accept, canonical } = stop.puzzle;
  const stanza = pick(stop.puzzle.stanza);
  const altMessage = pick(stop.puzzle.altMessage);
  const successMsg = pick(stop.puzzle.successMsg);
  const prompt = pick(stop.puzzle.prompt);

  // Render the stanza with [X] markers turned into gilded letters.
  const block = el('div', null, 'acrostic');
  stanza.forEach((line) => {
    const p = el('p', null, 'acrostic-line');
    p.innerHTML = line.replace(
      /\[([^\]]+)\]/g,
      (_, ch) => `<span class="gilt">${escapeHtml(ch)}</span>`
    );
    block.appendChild(p);
  });
  container.appendChild(block);

  container.appendChild(el('p', prompt, 'puzzle-prompt'));

  if (alreadySolved) {
    const done = el('p', `${t('puzzle.answer')} ${canonical}`, 'feedback correct');
    container.appendChild(done);
    return;
  }

  const form = document.createElement('form');
  form.noValidate = true;

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  input.placeholder = t('puzzle.acrosticPlaceholder');
  input.setAttribute('aria-label', t('puzzle.acrosticAria'));
  form.appendChild(input);

  const submit = el('button', t('puzzle.submit'), 'btn');
  submit.type = 'submit';
  form.appendChild(submit);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const guess = (input.value || '').trim().toLowerCase();
    if (!guess) return;
    if (guess === canonical.toLowerCase()) {
      flashFeedback(container, successMsg, 'correct');
      input.disabled = true;
      submit.disabled = true;
      onSolve();
    } else if (accept.includes(guess)) {
      flashFeedback(container, altMessage, 'correct');
      input.value = canonical;
      input.disabled = true;
      submit.disabled = true;
      onSolve();
    } else {
      flashFeedback(container, t('puzzle.acrosticWrong'), 'wrong');
      onWrong();
    }
  });
  container.appendChild(form);
}

/* =========================================================================
   Stop 5 — fill-in-the-blank verse with keepsake tray
   ========================================================================= */

function renderFillBlanks(container, stop, { onSolve, onWrong, alreadySolved }) {
  const template = pick(stop.puzzle.template);
  const prompt = pick(stop.puzzle.prompt);
  const successMsg = pick(stop.puzzle.successMsg);
  const decoyMessage = pick(stop.puzzle.decoyMessage);

  container.appendChild(el('p', prompt, 'puzzle-prompt'));

  // Witness Notes pane — surfacing this awards the SKANSTULL keepsake,
  // because the plant is in Stop 2's witness note.
  const notesPane = el('div', null, 'witness-notes-pane');
  const notesBtn = el('button', t('puzzle.openNotes'), 'btn btn-ghost');
  notesBtn.type = 'button';
  notesBtn.addEventListener('click', () => {
    notesPane.innerHTML = '';
    const all = getWitnessNotes();
    const list = el('div', null, 'witness-notes-list');
    // Notes are stored as the bilingual `{ en, sv }` record (or a plain
    // string from older saves) — `pick()` handles both transparently.
    Object.values(all).forEach((note) => {
      list.appendChild(el('p', pick(note), 'witness-note'));
    });
    if (!Object.keys(all).length) {
      list.appendChild(el('p', t('puzzle.noNotes')));
    }
    notesPane.appendChild(list);
    // Awarding SKANSTULL on first open — it appears in the tray.
    if (!hasKeepsake('SKANSTULL')) {
      awardKeepsake('SKANSTULL');
      flashFeedback(container, t('puzzle.skanstullSlip'), 'correct');
      paintTray();
    }
  });
  container.appendChild(notesBtn);
  container.appendChild(notesPane);

  // Working state — which keepsake is in which slot.
  // Pre-fill on a re-visit if already solved.
  const slots = template.filter((p) => p.slot).map((p) => p.slot);
  const placement = {}; // slotId -> word
  if (alreadySolved) {
    slots.forEach((s) => { placement[s.id] = s.answer; });
  }

  // Verse render
  const verseEl = el('div', null, 'fill-verse');
  function paintVerse() {
    verseEl.innerHTML = '';
    template.forEach((part, idx) => {
      if (part.text) {
        const span = document.createElement('span');
        span.className = 'fill-text';
        // Preserve newlines.
        part.text.split('\n').forEach((line, i, arr) => {
          span.appendChild(document.createTextNode(line));
          if (i < arr.length - 1) span.appendChild(document.createElement('br'));
        });
        verseEl.appendChild(span);
      } else if (part.slot) {
        const s = part.slot;
        const slotBtn = el('button', null, 'fill-slot');
        slotBtn.type = 'button';
        slotBtn.dataset.slotId = String(s.id);
        const filled = placement[s.id];
        if (filled) {
          slotBtn.textContent = filled;
          slotBtn.classList.add('filled');
          if (alreadySolved || filled === s.answer) slotBtn.classList.add('correct');
        } else {
          slotBtn.innerHTML = `<span class="slot-tag">${escapeHtml(s.tag)}</span>`;
        }
        slotBtn.addEventListener('click', () => {
          if (alreadySolved) return;
          if (placement[s.id]) {
            // Unplace — return word to tray.
            delete placement[s.id];
            paintVerse();
            paintTray();
          } else if (selectedWord) {
            placement[s.id] = selectedWord;
            selectedWord = null;
            paintVerse();
            paintTray();
            checkSolved();
          }
        });
        verseEl.appendChild(slotBtn);
      }
    });
  }

  // Tray
  const trayEl = el('div', null, 'keepsake-tray');
  let selectedWord = null;
  function paintTray() {
    trayEl.innerHTML = '';
    const used = new Set(Object.values(placement));
    const available = getKeepsakes().filter((k) => !used.has(k));
    if (!available.length) {
      trayEl.appendChild(el('p', t('puzzle.trayEmpty'), 'tray-empty'));
      return;
    }
    available.forEach((word) => {
      const chip = el('button', word, 'keepsake-chip');
      chip.type = 'button';
      if (selectedWord === word) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        if (alreadySolved) return;
        // Decoy detection: tap ANGEL → fire the Bellman quip but also allow placement attempts.
        if (word === 'ANGEL' && selectedWord !== 'ANGEL') {
          flashFeedback(container, decoyMessage, 'wrong');
        }
        selectedWord = (selectedWord === word) ? null : word;
        paintTray();
      });
      trayEl.appendChild(chip);
    });
  }

  paintVerse();
  paintTray();

  container.appendChild(verseEl);

  const trayWrap = el('div', null, 'tray-wrap');
  trayWrap.appendChild(el('h3', t('puzzle.trayHeading')));
  trayWrap.appendChild(el('p', t('puzzle.trayHint'), 'tray-hint'));
  trayWrap.appendChild(trayEl);
  container.appendChild(trayWrap);

  function checkSolved() {
    const allCorrect = slots.every((s) => placement[s.id] === s.answer);
    if (allCorrect) {
      flashFeedback(container, successMsg, 'correct');
      onSolve();
    } else {
      // Quiet wrong: only count as a "wrong attempt" once all slots are filled.
      const allFilled = slots.every((s) => placement[s.id]);
      if (allFilled) {
        onWrong();
      }
    }
  }
}

/* =========================================================================
   Shared helpers
   ========================================================================= */

function flashFeedback(container, msg, kind) {
  // Find or create a sticky feedback area at the end of the container.
  let fb = container.querySelector(':scope > .feedback');
  if (!fb) {
    fb = el('div', '', 'feedback');
    fb.setAttribute('role', 'status');
    container.appendChild(fb);
  }
  fb.textContent = msg;
  fb.className = 'feedback ' + (kind || '');
}
