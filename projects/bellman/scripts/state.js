/**
 * Game state — persisted to localStorage.
 *
 * Shape:
 *   {
 *     completed:    { [stopId: string]: true },
 *     answers:      { [stopId: string]: any },     // last submission (raw / shape varies by puzzle)
 *     attempts:     { [stopId: string]: number },  // count of WRONG submissions (drives auto-hints)
 *     hintLevel:    { [stopId: string]: 0|1|2|3 }, // 0 none, 1 nudge, 2 strong, 3 reveal
 *     keepsakes:    string[],                       // earned in order (e.g. ANGEL, HERRING)
 *     witnessNotes: { [stopId: string]: string },  // silently-logged side notes (Skanstull plant, etc.)
 *     stop1Step:    0|1|2,                          // sub-step within Stop 1's two-step puzzle
 *     finaleChoice: 'sing' | 'bury' | null,
 *     startedAt:    number | null,
 *     finishedAt:   number | null,
 *   }
 */

const STORAGE_KEY = 'stockholm-mystery:v2';

const DEFAULT_STATE = {
  completed: {},
  answers: {},
  attempts: {},
  hintLevel: {},
  keepsakes: [],
  witnessNotes: {},
  stop1Step: 0,
  finaleChoice: null,
  startedAt: null,
  finishedAt: null,
};

function fresh() {
  // Clone so callers can mutate freely.
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    return Object.assign(fresh(), parsed, {
      completed: parsed.completed || {},
      answers: parsed.answers || {},
      attempts: parsed.attempts || {},
      hintLevel: parsed.hintLevel || {},
      keepsakes: Array.isArray(parsed.keepsakes) ? parsed.keepsakes : [],
      witnessNotes: parsed.witnessNotes || {},
    });
  } catch (err) {
    console.warn('[state] failed to read, resetting', err);
    return fresh();
  }
}

function write(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[state] failed to persist', err);
  }
}

export function getState() {
  return read();
}

/* ---------- completion ---------- */

export function isCompleted(stopId) {
  return Boolean(read().completed[stopId]);
}

export function completedCount() {
  return Object.keys(read().completed).length;
}

export function markCompleted(stopId, answer) {
  const state = read();
  if (!state.startedAt) state.startedAt = Date.now();
  state.completed[stopId] = true;
  if (answer !== undefined) state.answers[stopId] = answer;
  write(state);
}

/* ---------- answers ---------- */

export function getAnswer(stopId) {
  const a = read().answers[stopId];
  return a == null ? '' : a;
}

export function recordAttempt(stopId, answer) {
  const state = read();
  if (!state.startedAt) state.startedAt = Date.now();
  state.answers[stopId] = answer;
  write(state);
}

/* ---------- attempts (drives auto-hints) ---------- */

export function incrementAttempts(stopId) {
  const state = read();
  state.attempts[stopId] = (state.attempts[stopId] || 0) + 1;
  // Auto-bump hint level: 3 → 1, 6 → 2, 9 → 3
  const n = state.attempts[stopId];
  const current = state.hintLevel[stopId] || 0;
  let next = current;
  if (n >= 9) next = Math.max(next, 3);
  else if (n >= 6) next = Math.max(next, 2);
  else if (n >= 3) next = Math.max(next, 1);
  state.hintLevel[stopId] = next;
  write(state);
  return { attempts: n, hintLevel: next };
}

export function getAttempts(stopId) {
  return read().attempts[stopId] || 0;
}

export function getHintLevel(stopId) {
  return read().hintLevel[stopId] || 0;
}

export function bumpHintLevel(stopId) {
  const state = read();
  const current = state.hintLevel[stopId] || 0;
  state.hintLevel[stopId] = Math.min(3, current + 1);
  write(state);
  return state.hintLevel[stopId];
}

/* ---------- keepsakes ---------- */

export function getKeepsakes() {
  return read().keepsakes.slice();
}

export function awardKeepsake(word) {
  if (!word) return;
  const state = read();
  if (!state.keepsakes.includes(word)) {
    state.keepsakes.push(word);
    write(state);
  }
}

export function hasKeepsake(word) {
  return read().keepsakes.includes(word);
}

/* ---------- witness notes ---------- */

export function setWitnessNote(stopId, note) {
  const state = read();
  state.witnessNotes[stopId] = note;
  write(state);
}

export function getWitnessNotes() {
  return read().witnessNotes;
}

/* ---------- stop 1 sub-step ---------- */

export function getStop1Step() {
  return read().stop1Step || 0;
}

export function setStop1Step(n) {
  const state = read();
  state.stop1Step = n;
  write(state);
}

/* ---------- finale choice ---------- */

export function getFinaleChoice() {
  return read().finaleChoice;
}

export function setFinaleChoice(choice) {
  const state = read();
  state.finaleChoice = choice;
  if (!state.finishedAt) state.finishedAt = Date.now();
  write(state);
}

/* ---------- reset ---------- */

export function reset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[state] failed to clear', err);
  }
}

/* ---------- unlock rule ---------- */

/**
 * Linear unlock: stop N is open when stop N-1 is solved.
 * Stop 1 is always open. (Production may bypass via QR-scan tokens.)
 */
export function isUnlocked(num, allStops) {
  if (num <= 1) return true;
  const prev = allStops.find((s) => s.num === num - 1);
  if (!prev) return false;
  return isCompleted(prev.id);
}
