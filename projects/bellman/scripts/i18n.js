/**
 * i18n — locale state + UI string table.
 *
 * The app is bilingual (English + Swedish). Two helpers are exported:
 *
 *   t(key)   — look up a UI chrome string ("Hint", "← Map", etc).
 *              Returns the value for the current locale, falling back to
 *              English, then to the key itself.
 *
 *   pick(v)  — pull a value out of a bilingual object, e.g. { en, sv }.
 *              If `v` is a plain string, it's returned as-is (so you can
 *              mix monolingual and bilingual fields in the same record
 *              during partial migrations).
 *
 * Locale persists to localStorage. On first load we sniff `navigator.language`
 * and default to Swedish for `sv*` locales, otherwise English.
 *
 * Renderers don't subscribe individually — `setLocale` dispatches a
 * `localechange` event on `window`, and `app.js` simply re-renders the
 * current view in response.
 */

const SUPPORTED = ['en', 'sv'];
const STORAGE_KEY = 'stockholm-mystery:locale';

function detectInitial() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(v)) return v;
  } catch {/* ignore */}
  try {
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('sv')) return 'sv';
  } catch {/* ignore */}
  return 'en';
}

let _locale = detectInitial();

// Reflect on <html lang="…"> at boot so screen-readers / spellchecker behave.
try { document.documentElement.lang = _locale; } catch {/* ignore in non-DOM contexts */}

export function getLocale() {
  return _locale;
}

export function setLocale(loc) {
  if (!SUPPORTED.includes(loc) || loc === _locale) return;
  _locale = loc;
  try { localStorage.setItem(STORAGE_KEY, loc); } catch {/* ignore */}
  try { document.documentElement.lang = loc; } catch {/* ignore */}
  window.dispatchEvent(new CustomEvent('localechange', { detail: { locale: loc } }));
}

export function toggleLocale() {
  setLocale(_locale === 'en' ? 'sv' : 'en');
}

/**
 * Pull the current-locale value out of a bilingual record.
 * Accepts:
 *   - { en, sv }         — bilingual object
 *   - "plain string"     — returned unchanged (legacy / proper nouns)
 *   - null / undefined   — returned unchanged
 *   - other primitives   — returned unchanged
 */
export function pick(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    if (_locale in value) return value[_locale];
    if ('en' in value) return value.en;
    if ('sv' in value) return value.sv;
  }
  return value;
}

/**
 * Pick across a list, e.g. an array of bilingual hint strings.
 */
export function pickList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(pick);
}

/* ------------------------------------------------------------------ *
 *  UI chrome strings
 *
 *  Keep keys grouped by view. Every key MUST have an `en` entry; `sv`
 *  is allowed to fall back to English while a translation is in flight.
 * ------------------------------------------------------------------ */

const UI = {
  en: {
    // App-wide / footer
    'app.title':        "Bellman's Lost Epistle",
    'app.lead':         'A walking mystery across five Stockholm pubs. Recover a song that history almost lost.',
    'footer.reset':     'Reset progress',
    'footer.resetTitle':'Reset all progress',
    'footer.confirmReset': 'Reset all progress and start over?',
    'footer.location':  'Gamla stan, anno 1789',
    'footer.langLabel': 'Language',

    // Home
    'home.intro1':      "It is 1795. Carl Michael Bellman lies dying in poverty. His patron, King Gustav III, was shot at a masked ball three years before. Bellman — who knew everyone in Stockholm: every nobleman, every harlot, every drunk — knew something the official inquiry missed.",
    'home.intro2':      "He couldn't publish. He'd be killed. So he did what a poet does: he wrote it into a song, tore it into five verses, and hid each one in a tavern he loved, trusting that someday the right kind of drunkard would put it back together.",
    'home.intro3':      "That's tonight. That's you.",
    'home.allWalked':   'You have walked the five. The reckoning awaits at Kvarnen.',
    'home.tavernsVisited': '{done} of {total} taverns visited.',
    'home.fiveTaverns': 'The Five Taverns',
    'home.witness':     'Witness',
    'home.visited':     '✓ visited',
    'home.locked':      '🔒 locked',
    'home.songbookBtn': '📖  Songbook',
    'home.factsBtn':    '⚜  Fact vs. Fiction',
    'home.revealBtn':   'Reveal the murderer →',

    // Stop view
    'stop.heading':     'Stop {n} of {total}',
    'stop.lostTitle':   'Lost in the alleys',
    'stop.lostBody':    'No such tavern. The fog has thickened.',
    'stop.returnMap':   '← Return to the map',
    'stop.verseHeader': 'Verse {n}',
    'stop.thePuzzle':   'The Puzzle',
    'stop.hintBtn':     'Hint',
    'stop.hint1':       'Hint 1',
    'stop.hint2':       'Hint 2',
    'stop.hint3':       'Reveal',
    'stop.mapBtn':      '← Map',
    'stop.songbookBtn': '📖 Songbook',

    // Next-step / directions
    'next.verseAdded':  'Verse added to your Songbook ✓',
    'next.keepsake':    'Keepsake earned:',
    'next.nextStop':    'Next stop:',
    'next.minutes':     '~{n} min',
    'next.landmark':    'Landmark:',
    'next.googleMaps':  '🗺  Google Maps',
    'next.appleMaps':   '🍎  Apple Maps',
    'next.qrNote':      'A QR code waits inside the next pub — scanning it will land you on the next page. (You can also tap the button.)',
    'next.onward':      "I'm there — onward to {title} →",
    'next.versesWhole': 'The verses are whole at last.',
    'next.toReckoning': 'To the reckoning →',
    'next.openMaps':    '🗺  Open in Maps',

    // Songbook
    'songbook.title':   'Songbook',
    'songbook.lead':    'Verses gathered, keepsakes carried.',
    'songbook.clueTray':'Clue tray',
    'songbook.noKeepsakes': '(No keepsakes yet — solve a puzzle.)',
    'songbook.collected':   'Verses collected',
    'songbook.noVerses':    '(No verses yet. The Songbook fills as you walk.)',

    // Finale
    'finale.title':         'The Reckoning',
    'finale.lead':          'You have walked the five. The verses are gathered.',
    'finale.choiceTitle':   'Sing it, or bury it?',
    'finale.choiceLead':    "The song is finally complete after 231 years. Bellman's voice, faint, asks one last thing of you.",
    'finale.sing':          '🎵  Sing it',
    'finale.bury':          '🕯  Bury it',
    'finale.sangH':         'You sang it.',
    'finale.sangP1':        'The full epistle rose into the rafters of Kvarnen — set to the melody of <em>Epistel N:o 71, "Ulla, min Ulla"</em>. The ghosts of Fredman, Mollberg, Movitz, and Ulla dispersed into the smoke. The song is finally public after 231 years.',
    'finale.sangP2':        'The Sillström family will not be pleased. Bellman would have laughed.',
    'finale.buriedH':       'You buried it.',
    'finale.buriedP1':      "You folded the broadside, ceremonially, and pocketed it. Ulla's voice, faintly: <em>\"Thank you, friends.\"</em> The song stays a secret, returned to Bellman. Ulla is at peace.",
    'finale.buriedP2':      'Some loves the world is not entitled to know.',
    'finale.skalH':         'Skål.',
    'finale.skalP1':        'Carl Michael Bellman died poor and beloved on 11 February 1795. He was 54. Pour one out.',
    'finale.skalP2':        'Tack för sällskapet — and may your candle never gutter.',
    'finale.reconsider':    'Reconsider the choice',

    // Credits
    'credits.title':        'Fact vs. Fiction',
    'credits.lead':         'A clean ledger — what was real, and what we invented.',
    'credits.realH':        'Real',
    'credits.inventedH':    'Invented for the game',
    'credits.realList': [
      '<strong>Carl Michael Bellman</strong> (1740–1795), Swedish national poet.',
      '<strong>Fredmans Epistlar</strong> (1790) — 82 numbered epistles. Our 83rd is the fictional add-on.',
      "<strong>Fredman, Ulla Winblad, Mollberg, Movitz</strong> — Bellman's recurring fictional cast.",
      '<strong>King Gustav III</strong>, shot at the masked ball on 16 March 1792 at the Royal Opera; died 29 March.',
      '<strong>Jacob Johan Anckarström</strong> — the real triggerman.',
      '<strong>Riddarholmskyrkan</strong> — the royal burial church, where Gustav III lies.',
      '<strong>Engelen</strong>, <strong>Wirströms cellar vaults</strong> (17th c.), <strong>Akkurat</strong>, <strong>Kvarnen</strong> (1908) — all real Stockholm pubs.',
      "<strong>Swedish punsch</strong> as Bellman's drink of choice — well-documented.",
      'The closing line — <em>"Drick ur ditt glas…"</em> — is real Bellman, from Fredmans Sång No. 21.',
    ],
    'credits.inventedList': [
      "<strong>Fredmans Epistel N:o 83</strong> — Bellman wrote 82. There is no lost 83rd.",
      "<strong>Baron Ulrik Sillström</strong> — wholly invented; not based on any real noble house.",
      "<strong>The arms (three silver herrings on black)</strong> — invented; not in Riddarhuset's registry.",
      'A "secret financier" of the assassination — the real conspiracy is well-documented.',
      "Sillström's death at <strong>Skanstull</strong> — invented.",
      "Ulla as romantic witness — invented.",
      'All ghost appearances — obviously.',
    ],
    'credits.disclaimer':   "We invent a fictional villain rather than implicate any real noble house. Real conspirators (Anckarström, Ribbing, Horn) appear only by name and only in their historically attested roles. No real person is accused of anything they didn't do.",

    // Puzzle generic
    'puzzle.submit':        'Submit',
    'puzzle.readAloud':     'Read it aloud — submit',
    'puzzle.openNotes':     '📜  Open Witness Notes',
    'puzzle.noNotes':       '(No notes yet.)',
    'puzzle.skanstullSlip': 'A new word slips into your tray: SKANSTULL.',
    'puzzle.trayHeading':   'Your clue tray',
    'puzzle.trayHint':      'Tap a word to select, then tap a slot to drop it. Tap a filled slot to remove.',
    'puzzle.trayEmpty':     '(Tray empty.)',
    'puzzle.acrosticPlaceholder': 'Seven letters…',
    'puzzle.acrosticAria':  'Where does Ulla send you?',
    'puzzle.acrosticWrong': "That isn't where she sends you. Read the gilt letters again.",
    'puzzle.reorderWrong':  "Not quite. Try reading them aloud — Mollberg always did.",
    'puzzle.answer':        'Answer:',
    'puzzle.unknownType':   'Unknown puzzle type:',
  },

  sv: {
    // App-wide / footer
    'app.title':        'Bellmans förlorade epistel',
    'app.lead':         'Ett vandrande mysterium över fem Stockholms-krogar. Återskapa en sång som historien nästan tappade bort.',
    'footer.reset':     'Nollställ',
    'footer.resetTitle':'Nollställ alla framsteg',
    'footer.confirmReset': 'Nollställa alla framsteg och börja om?',
    'footer.location':  'Gamla stan, anno 1789',
    'footer.langLabel': 'Språk',

    // Home
    'home.intro1':      'Det är 1795. Carl Michael Bellman ligger döende i fattigdom. Hans gynnare, kung Gustav III, sköts på en maskeradbal tre år tidigare. Bellman — som kände var och en i Stockholm: varje adelsman, varje sköka, varje fyllbult — visste något som den officiella undersökningen missade.',
    'home.intro2':      'Han kunde inte publicera det. Han skulle ha dödats. Så han gjorde vad en skald gör: han skrev det i en sång, slet den i fem verser, och gömde varje del på en krog han älskade — i förlitan på att någon dag skulle rätt sorts fyllbult sätta ihop den igen.',
    'home.intro3':      'Det är ikväll. Det är du.',
    'home.allWalked':   'Du har vandrat de fem. Uppgörelsen väntar på Kvarnen.',
    'home.tavernsVisited': '{done} av {total} krogar besökta.',
    'home.fiveTaverns': 'De fem krogarna',
    'home.witness':     'Vittne',
    'home.visited':     '✓ besökt',
    'home.locked':      '🔒 låst',
    'home.songbookBtn': '📖  Sångbok',
    'home.factsBtn':    '⚜  Fakta vs. fiktion',
    'home.revealBtn':   'Avslöja mördaren →',

    // Stop view
    'stop.heading':     'Stopp {n} av {total}',
    'stop.lostTitle':   'Vilse i gränderna',
    'stop.lostBody':    'Ingen sådan krog. Dimman har tjocknat.',
    'stop.returnMap':   '← Tillbaka till kartan',
    'stop.verseHeader': 'Vers {n}',
    'stop.thePuzzle':   'Pusslet',
    'stop.hintBtn':     'Ledtråd',
    'stop.hint1':       'Ledtråd 1',
    'stop.hint2':       'Ledtråd 2',
    'stop.hint3':       'Avslöja',
    'stop.mapBtn':      '← Karta',
    'stop.songbookBtn': '📖 Sångbok',

    // Next-step / directions
    'next.verseAdded':  'Vers tillagd i din sångbok ✓',
    'next.keepsake':    'Minne vunnet:',
    'next.nextStop':    'Nästa stopp:',
    'next.minutes':     '~{n} min',
    'next.landmark':    'Landmärke:',
    'next.googleMaps':  '🗺  Google Maps',
    'next.appleMaps':   '🍎  Apple Maps',
    'next.qrNote':      'En QR-kod väntar inne på nästa krog — skannar du den hamnar du på nästa sida. (Du kan också trycka på knappen.)',
    'next.onward':      'Jag är där — vidare till {title} →',
    'next.versesWhole': 'Verserna är äntligen hela.',
    'next.toReckoning': 'Till uppgörelsen →',
    'next.openMaps':    '🗺  Öppna i kartan',

    // Songbook
    'songbook.title':   'Sångbok',
    'songbook.lead':    'Verser samlade, minnen burna.',
    'songbook.clueTray':'Ledtrådsbricka',
    'songbook.noKeepsakes': '(Inga minnen ännu — lös ett pussel.)',
    'songbook.collected':   'Insamlade verser',
    'songbook.noVerses':    '(Inga verser ännu. Sångboken fylls medan du vandrar.)',

    // Finale
    'finale.title':         'Uppgörelsen',
    'finale.lead':          'Du har vandrat de fem. Verserna är samlade.',
    'finale.choiceTitle':   'Sjung den, eller begrav den?',
    'finale.choiceLead':    'Sången är äntligen hel efter 231 år. Bellmans röst, svag, ber dig om en sista sak.',
    'finale.sing':          '🎵  Sjung den',
    'finale.bury':          '🕯  Begrav den',
    'finale.sangH':         'Du sjöng den.',
    'finale.sangP1':        'Hela epistelen steg upp i Kvarnens takbjälkar — till melodin av <em>Epistel N:o 71, "Ulla, min Ulla"</em>. Spöken av Fredman, Mollberg, Movitz och Ulla skingrades i röken. Sången är äntligen offentlig efter 231 år.',
    'finale.sangP2':        'Familjen Sillström kommer inte att gilla det. Bellman skulle ha skrattat.',
    'finale.buriedH':       'Du begravde den.',
    'finale.buriedP1':      'Du vek ihop bladet, högtidligt, och stoppade det i fickan. Ullas röst, svagt: <em>"Tack, vänner."</em> Sången förblir en hemlighet, återlämnad till Bellman. Ulla har frid.',
    'finale.buriedP2':      'Vissa kärlekar har världen ingen rätt att känna till.',
    'finale.skalH':         'Skål.',
    'finale.skalP1':        'Carl Michael Bellman dog fattig och älskad den 11 februari 1795. Han var 54. Häll upp en till.',
    'finale.skalP2':        'Tack för sällskapet — och må ditt ljus aldrig fladdra ut.',
    'finale.reconsider':    'Omvärdera valet',

    // Credits
    'credits.title':        'Fakta vs. fiktion',
    'credits.lead':         'En ren bokföring — vad som var verkligt, och vad vi hittade på.',
    'credits.realH':        'Verkligt',
    'credits.inventedH':    'Påhittat för spelet',
    'credits.realList': [
      '<strong>Carl Michael Bellman</strong> (1740–1795), Sveriges nationalskald.',
      '<strong>Fredmans Epistlar</strong> (1790) — 82 numrerade epistlar. Vår 83:e är det fiktiva tillägget.',
      '<strong>Fredman, Ulla Winblad, Mollberg, Movitz</strong> — Bellmans återkommande fiktiva ensemble.',
      '<strong>Kung Gustav III</strong>, skjuten på maskeradbalen den 16 mars 1792 på Kungliga Operan; dog den 29 mars.',
      '<strong>Jacob Johan Anckarström</strong> — den verkliga gärningsmannen.',
      '<strong>Riddarholmskyrkan</strong> — den kungliga gravkyrkan, där Gustav III vilar.',
      '<strong>Engelen</strong>, <strong>Wirströms källarvalv</strong> (1600-tal), <strong>Akkurat</strong>, <strong>Kvarnen</strong> (1908) — alla riktiga Stockholmskrogar.',
      '<strong>Svensk punsch</strong> som Bellmans dryck av val — väldokumenterat.',
      'Slutraden — <em>"Drick ur ditt glas…"</em> — är äkta Bellman, ur Fredmans Sång nr 21.',
    ],
    'credits.inventedList': [
      '<strong>Fredmans Epistel N:o 83</strong> — Bellman skrev 82. Det finns ingen förlorad 83:e.',
      '<strong>Baron Ulrik Sillström</strong> — helt påhittad; inte baserad på någon verklig adelsätt.',
      '<strong>Vapnet (tre silversillar på svart)</strong> — påhittat; finns inte i Riddarhusets register.',
      'En "hemlig finansiär" av mordet — den verkliga konspirationen är väldokumenterad.',
      'Sillströms död vid <strong>Skanstull</strong> — påhittad.',
      'Ulla som romantiskt vittne — påhittat.',
      'Alla spökframträdanden — uppenbarligen.',
    ],
    'credits.disclaimer':   'Vi hittar på en fiktiv skurk hellre än att utpeka någon verklig adelsätt. Verkliga konspiratörer (Anckarström, Ribbing, Horn) nämns bara vid namn och bara i sina historiskt belagda roller. Ingen verklig person anklagas för något de inte gjort.',

    // Puzzle generic
    'puzzle.submit':        'Skicka',
    'puzzle.readAloud':     'Läs högt — skicka',
    'puzzle.openNotes':     '📜  Öppna vittnesanteckningar',
    'puzzle.noNotes':       '(Inga anteckningar ännu.)',
    'puzzle.skanstullSlip': 'Ett nytt ord slinker ner i din bricka: SKANSTULL.',
    'puzzle.trayHeading':   'Din ledtrådsbricka',
    'puzzle.trayHint':      'Tryck på ett ord för att välja, tryck sedan på en lucka för att släppa det. Tryck på en fylld lucka för att ta bort.',
    'puzzle.trayEmpty':     '(Brickan är tom.)',
    'puzzle.acrosticPlaceholder': 'Sju bokstäver…',
    'puzzle.acrosticAria':  'Vart skickar Ulla dig?',
    'puzzle.acrosticWrong': 'Dit skickar hon dig inte. Läs de gyllene bokstäverna igen.',
    'puzzle.reorderWrong':  'Inte riktigt. Försök läsa högt — det gjorde Mollberg alltid.',
    'puzzle.answer':        'Svar:',
    'puzzle.unknownType':   'Okänd pusseltyp:',
  },
};

/**
 * Look up a UI string. Supports {placeholder} substitution via the second arg.
 *
 *   t('home.tavernsVisited', { done: 3, total: 5 })
 *   // → "3 of 5 taverns visited."
 */
export function t(key, vars) {
  const table = UI[_locale] || UI.en;
  let raw = table[key];
  if (raw == null) raw = UI.en[key];
  if (raw == null) return key;
  if (Array.isArray(raw)) return raw;
  if (vars && typeof raw === 'string') {
    return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }
  return raw;
}
