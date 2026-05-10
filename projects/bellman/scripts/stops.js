/**
 * Stop data for "Bellman's Lost Epistle" — a five-pub mystery walk
 * through Stockholm, recovering Fredmans Epistel N:o 83.
 *
 * BILINGUAL DATA SHAPE
 * --------------------
 * Translatable fields are objects of the form `{ en: '...', sv: '...' }`.
 * Use `pick()` from `i18n.js` to read them at render time:
 *
 *   import { pick } from './i18n.js';
 *   pick(stop.story);   // → English or Swedish depending on current locale
 *
 * Plain strings (proper nouns, addresses, URLs, IDs) are left unwrapped.
 * `pick()` returns plain strings unchanged, so it's safe to call on either.
 *
 * Source of truth:
 *   - STORY_BIBLE.md  (English verses, character voice, beats — all canon)
 *   - PUZZLE_DESIGN.md (per-stop puzzle mechanics, hints, keepsakes)
 *
 * The Swedish renderings are this game's own attempts at carrying the
 * Bellman flavour into Swedish — they don't pretend to be 18th-century
 * pastiche, but they scan and rhyme where the original does.
 *
 * Each stop has:
 *   id          — URL slug / route param
 *   num         — display order (1..5)
 *   title       — pub name (proper noun, language-neutral)
 *   address     — street / district (proper noun)
 *   witness     — character name
 *   beat        — bilingual one-line act label
 *   intro       — bilingual landing-list blurb
 *   walkMinutes — minutes' walk from the previous stop
 *   mapsQuery   — search string for "open in maps" links
 *   story       — bilingual story body (\n\n separated paragraphs)
 *   verse       — bilingual verse this stop yields, added to the Songbook
 *   keepsake    — clue word (uppercase, language-neutral)
 *   witnessNote — bilingual silently-logged side fact (used at the finale)
 *   puzzle      — { type, ...spec } — see scripts/puzzles.js for renderers
 *   hints       — array of bilingual hint strings (3 levels)
 *   directions  — closing card with bilingual navigation copy
 */

export const STOPS = [
  /* ===================================================================
     STOP 1 — Engelen
     Witness: Jean Fredman · Beat: Prologue & Recruitment
     Mechanic: trivia (multi-choice) + observation (photo tap)
     =================================================================== */
  {
    id: 'engelen',
    num: 1,
    title: 'Engelen',
    address: 'Kornhamnstorg 59B, Gamla Stan',
    witness: 'Jean Fredman',
    beat: {
      en: 'Prologue & Recruitment',
      sv: 'Prolog & värvning',
    },
    intro: {
      en: 'A long-running Gamla Stan pub by the water — wood, candlelight, and live music most nights. A ruined watchmaker slides a coaster across your table.',
      sv: 'En anrik Gamla Stan-krog vid vattnet — trä, ljusken, och livemusik nästan varje kväll. En ruinerad urmakare skjuter ett underlägg över ditt bord.',
    },
    walkMinutes: 0,
    mapsQuery: 'Engelen, Kornhamnstorg 59B, Stockholm',
    story: {
      en: `Friends — if you read this, the wine has chosen you.
I am Fredman, dead these many years, and yet thirsty.

My master Bellman left a song in five pieces, scattered like teeth across the city. The first piece is yours. Find the next where Mollberg cracked his cup — under the vault, on Stora Nygatan, where the blues now plays.`,
      sv: `Vänner — läser ni detta, så har vinet valt er.
Jag är Fredman, död sedan många år, men ändå törstig.

Min mästare Bellman lämnade en sång i fem delar, utspridda som tänder över staden. Första delen är er. Finn nästa där Mollberg knäckte sin bägare — under valvet, på Stora Nygatan, där bluesen nu spelar.`,
    },
    verse: {
      en: `In Engelen's hall, where the night is sung,
I leave the first of five — where the angel's hung.
Drink deep, and listen — under candle's tongue:
The masked one's name is buried in this song.`,
      sv: `I Engelens hus, där sången aldrig stannar,
lämnar jag den första av fem — där en ängel spanar.
Drick djupt, och lyssna — vid stearinljusets tunga:
Den maskerades namn är begravt i vår sjunga.`,
    },
    keepsake: 'ANGEL',
    witnessNote: {
      en: "Fredman: 'Eighty-two epistles my master wrote in life — and tonight, you and I shall make it eighty-three.'",
      sv: 'Fredman: "Åttiotvå epistlar skrev min mästare i livet — och ikväll, du och jag, gör vi den åttiotredje."',
    },
    puzzle: {
      type: 'multi-step',
      steps: [
        {
          type: 'multi-choice',
          prompt: {
            en: 'Fredman taps his glass: "How many epistles did my master Bellman publish in his lifetime?"',
            sv: 'Fredman knackar på sitt glas: "Hur många epistlar gav min mästare Bellman ut under sin levnad?"',
          },
          options: ['12', '50', '82', '100'],
          answerIndex: 2,
          wrongQuip: {
            en: 'Generous, friend, but no.',
            sv: 'Generöst, vän, men nej.',
          },
          rightQuip: {
            en: 'Eighty-two — and tonight, you and I shall make it eighty-three. Now look about you.',
            sv: 'Åttiotvå — och ikväll, du och jag, gör vi den åttiotredje. Se dig nu omkring.',
          },
        },
        {
          type: 'observation',
          prompt: {
            en: '"My verse names a thing watching this very room. Find it. Tap it."',
            sv: '"Min vers nämner något som ser över detta rum. Finn det. Tryck på det."',
          },
          options: [
            { id: 'candle',   glyph: '🕯️', label: { en: 'A candle on the table',     sv: 'Ett ljus på bordet' } },
            { id: 'angel',    glyph: '👼', label: { en: 'An angel above the bar',    sv: 'En ängel ovanför baren' } },
            { id: 'beam',     glyph: '🪵', label: { en: 'A wooden ceiling beam',     sv: 'En takbjälke av trä' } },
            { id: 'fiddle',   glyph: '🎻', label: { en: 'A fiddle on the wall',      sv: 'En fiol på väggen' } },
          ],
          answerId: 'angel',
          wrongQuip: {
            en: 'Pretty, but not what the verse names.',
            sv: 'Vackert, men inte vad versen nämner.',
          },
          rightQuip: {
            en: "The angel — Engelen's namesake — watches the night, and remembers everything that's drunk beneath her.",
            sv: 'Ängeln — Engelens namne — ser över natten, och minns allt som druckits under henne.',
          },
        },
      ],
    },
    hints: [
      {
        en: "Fredman wrote eighty-two, but tonight there will be one more — and that's why we're here.",
        sv: 'Fredman skrev åttiotvå, men ikväll blir det en till — och det är därför vi är här.',
      },
      {
        en: "Verse 1, line 2: 'where the angel's hung.' What is hung in this room that gives the pub its name?",
        sv: 'Vers 1, rad 2: "där en ängel spanar." Vad hänger i detta rum som ger krogen dess namn?',
      },
      {
        en: 'Step A: 82. Step B: tap the angel above the bar.',
        sv: 'Steg A: 82. Steg B: tryck på ängeln ovanför baren.',
      },
    ],
    directions: {
      next: 'wirstroms',
      copy: {
        en: 'Find the next where Mollberg cracked his cup — under the vault, on Stora Nygatan, where the blues now plays.',
        sv: 'Finn nästa där Mollberg knäckte sin bägare — under valvet, på Stora Nygatan, där bluesen nu spelar.',
      },
      walking: {
        distance: '~200 m',
        minutes: 3,
        steps: {
          en: [
            'Step out onto Kornhamnstorg, the small waterside square at the south end of Gamla Stan.',
            'Cross the square to its north-west corner — Stora Nygatan begins there and runs north into the old town.',
            'Walk one short block up Stora Nygatan.',
            'Wirströms is at #13 on your right. Head down the spiral stair into the 17th-century cellar.',
          ],
          sv: [
            'Gå ut på Kornhamnstorg, det lilla torget vid vattnet i södra Gamla Stan.',
            'Korsa torget till dess nordvästra hörn — där börjar Stora Nygatan och löper norrut in i Gamla Stan.',
            'Gå ett kort kvarter uppför Stora Nygatan.',
            'Wirströms ligger på nr 13 på höger sida. Gå nedför spiraltrappan till 1600-talskällaren.',
          ],
        },
        landmark: {
          en: 'Kornhamnstorg · the south-end waterfront of Gamla Stan',
          sv: 'Kornhamnstorg · Gamla Stans södra strandkant',
        },
        note: {
          en: 'The cellar entrance at Wirströms is unmarked from the street — look for the sandstone arch and listen for the blues band.',
          sv: 'Källaringången hos Wirströms är omärkt från gatan — leta efter sandstensvalvet och lyssna efter bluesbandet.',
        },
        google: 'https://www.google.com/maps/dir/?api=1&origin=Engelen,+Kornhamnstorg+59B,+Stockholm&destination=Wirstr%C3%B6ms+Pub,+Stora+Nygatan+13,+Stockholm&travelmode=walking',
        apple: 'https://maps.apple.com/?saddr=Kornhamnstorg+59B,+Stockholm&daddr=Stora+Nygatan+13,+Stockholm&dirflg=w',
      },
    },
  },

  /* ===================================================================
     STOP 2 — Wirströms Pub
     Witness: Corporal Mollberg · Beat: First Clue — the Red Coat
     Mechanic: drag-to-reorder verse lines
     =================================================================== */
  {
    id: 'wirstroms',
    num: 2,
    title: 'Wirströms Pub',
    address: 'Stora Nygatan 13, Gamla Stan (down the spiral stair)',
    witness: 'Corporal Mollberg',
    beat: {
      en: 'First Clue — the Red Coat',
      sv: 'Första ledtråden — den röda rocken',
    },
    intro: {
      en: 'A 17th-century cellar where a brawler watchmaker mutters about a man in a red coat.',
      sv: 'En 1600-talskällare där en slagskämpig urmakare muttrar om en man i röd rock.',
    },
    walkMinutes: 6,
    mapsQuery: 'Wirströms Pub, Stora Nygatan 13, Stockholm',
    story: {
      en: `Hear me — I, Corporal Mollberg, never lie except when I'm winning.

The night the king fell, I was here, in this very vault, drinking on credit. A man came down — red coat, gold buttons, mask still on his face. He paid for the whole table in gold, told a joke about Frenchmen, and dropped a flask. On the flask: a fish. Three of them, silver, on black.

He left before the song ended. I kept the flask. I kept this verse. But damn me — I've been drinking on credit and I've muddled the lines. You sort it. I never could read sober anyway.

(Aside, half to himself: "Some say he fell from his horse near Skanstull, the bastard. I say a horse never threw a Sillström unless a Sillström deserved it.")`,
      sv: `Hör mig — jag, Korpral Mollberg, ljuger aldrig utom när jag vinner.

Den natt kungen föll satt jag här, i detta valv, och drack på krita. En man kom ned — röd rock, guldknappar, masken än på ansiktet. Han betalade hela bordet i guld, drog ett skämt om fransmän, och tappade en plunta. På pluntan: en fisk. Tre stycken, i silver, på svart.

Han gick innan visan var slut. Jag behöll pluntan. Jag behöll versen. Men tusan också — jag har druckit på krita och röra till raderna. Sortera dem du. Jag kunde aldrig läsa nykter ändå.

(Halvt för sig själv: "Somliga säger att han föll av sin häst vid Skanstull, kanaljen. Jag säger att en häst aldrig kastat av en Sillström om inte en Sillström förtjänat det.")`,
    },
    verse: {
      en: `Beneath the vault, where Mollberg cracked his cup,
A red coat passed, then bowed, then bottomed up.
He paid in gold, that brother of the masque —
The second clue: a herring on his flask.`,
      sv: `Under valvet, där Mollberg knäckte sin bägare,
en röd rock svepte förbi, en bugning än kvar,
han betalte i guld, den maskerade brodern, så sant —
andra ledtråden: en sill på hans plunta brann.`,
    },
    keepsake: 'HERRING',
    witnessNote: {
      en: "Mollberg, half-drunk: 'Some say the man fell from his horse near SKANSTULL. A horse never threw a Sillström unless a Sillström deserved it.'",
      sv: 'Mollberg, halvfull: "Somliga säger att mannen föll av sin häst vid SKANSTULL. En häst kastade aldrig av en Sillström om inte en Sillström förtjänat det."',
    },
    puzzle: {
      type: 'reorder',
      prompt: {
        en: "Sort Mollberg's muddled lines back into a verse. Listen for the rhymes.",
        sv: 'Sortera Mollbergs hopblandade rader tillbaka till en vers. Lyssna efter rimmen.',
      },
      // Lines listed here in the CORRECT order; the renderer shuffles for display.
      correctOrder: {
        en: [
          'Beneath the vault, where Mollberg cracked his cup,',
          'A red coat passed, then bowed, then bottomed up.',
          'He paid in gold, that brother of the masque —',
          'The second clue: a herring on his flask.',
        ],
        sv: [
          'Under valvet, där Mollberg knäckte sin bägare,',
          'en röd rock svepte förbi, en bugning än kvar,',
          'han betalte i guld, den maskerade brodern, så sant —',
          'andra ledtråden: en sill på hans plunta brann.',
        ],
      },
      // Deterministic display shuffle so the puzzle feels stable across reloads.
      displayOrder: [2, 0, 3, 1],
      successMsg: {
        en: "There. As I sang it, more or less. Now go and find Movitz — he's wheezing out his last confession by the water, hard by the kings.",
        sv: 'Där. Ungefär som jag sjöng den. Gå nu och finn Movitz — han väser ut sin sista bikt vid vattnet, tätt intill kungarna.',
      },
    },
    hints: [
      {
        en: "Mollberg starts where he is — in the cellar. Then someone arrives. Then they pay. Then they leave a clue.",
        sv: 'Mollberg börjar där han är — i källaren. Sedan kommer någon. Sedan betalar de. Sedan lämnar de en ledtråd.',
      },
      {
        en: "The rhymes pair up: a line ending in 'cup' must be followed by one ending in 'up'.",
        sv: 'Rimmen går ihop: en rad om en bägare följs av en om en bugning, en om guld följs av en om plunta.',
      },
      {
        en: 'Order: cellar → cup, red coat → up, paid in gold → masque, herring → flask.',
        sv: 'Ordning: källare → bägare, röd rock → kvar, betalte i guld → så sant, sill → plunta brann.',
      },
    ],
    directions: {
      next: 'monks-porter',
      copy: {
        en: "Cross to the western waterfront. Movitz is wheezing his last confession at the Munkbron, the kings' burial church just over the water.",
        sv: 'Korsa till den västra strandkanten. Movitz väser ut sin sista bikt vid Munkbron, kungarnas gravkyrka är synlig på andra sidan vattnet.',
      },
      walking: {
        distance: '~250 m',
        minutes: 4,
        steps: {
          en: [
            'Climb back up to street level on Stora Nygatan.',
            'Turn right and walk south one block.',
            'Turn right onto Munkbrogatan, heading toward the waterfront.',
            'Continue to the quay — Riddarholmen and its spire-topped church will be across the water.',
            'Monks Porter House is at Munkbron 11, facing the water.',
          ],
          sv: [
            'Klättra upp till gatunivå på Stora Nygatan.',
            'Sväng höger och gå söderut ett kvarter.',
            'Sväng höger in på Munkbrogatan, mot strandkanten.',
            'Fortsätt till kajen — Riddarholmen och dess spirkyrka ligger på andra sidan vattnet.',
            'Monks Porter House ligger på Munkbron 11, mot vattnet.',
          ],
        },
        landmark: {
          en: "Riddarholmskyrkan across the water — the royal burial church, Gustav III's resting place.",
          sv: 'Riddarholmskyrkan över vattnet — den kungliga gravkyrkan, Gustav III:s viloplats.',
        },
        note: {
          en: 'If the Munkbron quay is closed for ferry works, cut through Schönfeldts Gränd instead.',
          sv: 'Om Munkbron-kajen är avstängd för färjearbeten, ta i stället Schönfeldts Gränd.',
        },
        google: 'https://www.google.com/maps/dir/?api=1&origin=Stora+Nygatan+13,+Stockholm&destination=Monks+Porter+House,+Munkbron+11,+Stockholm&travelmode=walking',
        apple: 'https://maps.apple.com/?saddr=Stora+Nygatan+13,+Stockholm&daddr=Munkbron+11,+Stockholm&dirflg=w',
      },
    },
  },

  /* ===================================================================
     STOP 3 — Monks Porter House
     Witness: Father Movitz · Beat: Identification — the Coat of Arms
     Mechanic: tap the right shield
     =================================================================== */
  {
    id: 'monks-porter',
    num: 3,
    title: 'Monks Porter House',
    address: 'Munkbron 11, Gamla Stan (waterfront, facing Riddarholmen)',
    witness: 'Father Movitz',
    beat: {
      en: 'Identification — the Coat of Arms',
      sv: 'Identifiering — vapenskölden',
    },
    intro: {
      en: 'A monastic-themed pub by the water. A dying bassoonist makes his confession.',
      sv: 'En klosterinspirerad krog vid vattnet. En döende fagottist gör sin bikt.',
    },
    walkMinutes: 4,
    mapsQuery: 'Monks Porter House, Munkbron 11, Stockholm',
    story: {
      en: `Bless you, friends. Movitz here — bassoonist, sinner, dying these forty years.

I will tell you what I told no priest. I was paid to play at a private supper, the night before the king was shot. The host wore a black coat with three silver fish — sill, herring, you understand — on his breast. He counted out coin to a man with bandaged hands. The man with bandaged hands, I later learned, was Anckarström. The host I knew by his arms: the house of Sillström.

Disgraced now. Forgotten. But three fish on black — that is your second clue. *cough* You'll know the arms when you see them. I drew them once, on a coaster. I drew several. Damned if I can remember which one was right.

(He nods toward the window.) Look across the water. The kings are sleeping over there.`,
      sv: `Välsigne er, vänner. Movitz här — fagottist, syndare, döende sedan fyrtio år.

Jag ska berätta vad jag inte sa till någon präst. Jag fick betalt för att spela vid en privat supé, kvällen innan kungen sköts. Värden bar en svart rock med tre silverfiskar — sill, ni förstår — på bröstet. Han räknade upp mynt till en man med bandagerade händer. Mannen med bandagerade händer, fick jag senare veta, var Anckarström. Värden kände jag igen på vapnet: ätten Sillström.

Vanärad nu. Bortglömd. Men tre fiskar på svart — det är er andra ledtråd. *host* Ni ska känna igen vapnet när ni ser det. Jag ritade det en gång, på en glasunderlägg. Jag ritade flera. Tusan om jag minns vilket som var rätt.

(Han nickar mot fönstret.) Se ut över vattnet. Kungarna sover där borta.`,
    },
    verse: {
      en: `Hard by the kings, where Riddarholmen sleeps,
Movitz, half-dead, his last confession keeps:
Three silver fish on field of midnight — see?
A house disgraced. A king who'd never be.`,
      sv: `Tätt intill kungarna, där Riddarholmen sover,
Movitz, halvdöd, sin sista bikt nu lovar:
Tre silvriga fiskar på midnattens fält — se där?
En vanärad ätt. En kung som aldrig blev där.`,
    },
    keepsake: 'SILLSTRÖM',
    witnessNote: {
      en: "Movitz: 'The host I knew by his arms: three silver fish on field of midnight. The house of SILLSTRÖM. The man with bandaged hands at his table — Anckarström himself.'",
      sv: 'Movitz: "Värden kände jag på vapnet: tre silverfiskar på midnattens fält. Ätten SILLSTRÖM. Mannen med bandagerade händer vid hans bord — Anckarström själv."',
    },
    puzzle: {
      type: 'shield',
      prompt: {
        en: 'Movitz drew four shields on coasters. Re-read the verse: three silver fish on field of midnight. Tap the right one.',
        sv: 'Movitz ritade fyra sköldar på glasunderlägg. Läs versen igen: tre silverfiskar på midnattens fält. Tryck på den rätta.',
      },
      shields: [
        { id: 'A', label: { en: 'Two gold lions on red',           sv: 'Två gyllene lejon på rött' },
          field: '#7a1212', figures: 'lions-2', metal: '#d4a534' },
        { id: 'B', label: { en: 'Three silver fish on black',      sv: 'Tre silverfiskar på svart' },
          field: '#0c0c1a', figures: 'fish-3', metal: '#d8d8d8' },
        { id: 'C', label: { en: 'A crown above a sword on blue',   sv: 'En krona över ett svärd på blått' },
          field: '#1a3a6e', figures: 'crown-sword', metal: '#d4a534' },
        { id: 'D', label: { en: 'Three gold fish on white',        sv: 'Tre gyllene fiskar på vitt' },
          field: '#f1ead0', figures: 'fish-3', metal: '#c9a64a' },
      ],
      answerId: 'B',
      wrongQuip: {
        en: 'Re-read the verse, friend. Silver. On midnight.',
        sv: 'Läs versen igen, vän. Silver. På midnatt.',
      },
      successMsg: {
        en: 'House Sillström. *Sill* — herring, in the old tongue. The arms were never registered at Riddarhuset; the family saw to that.',
        sv: 'Ätten Sillström. *Sill* — på det gamla tungomålet. Vapnet registrerades aldrig vid Riddarhuset; ätten såg till det.',
      },
    },
    hints: [
      {
        en: 'Re-read Verse 3. Movitz says **silver** fish on **midnight**. What colour is midnight?',
        sv: 'Läs vers 3 igen. Movitz säger **silver**fiskar på **midnatt**. Vilken färg är midnatt?',
      },
      {
        en: 'Three. Silver. On black. Only two of these shields are even close.',
        sv: 'Tre. Silver. På svart. Bara två av sköldarna är ens i närheten.',
      },
      {
        en: 'Shield B — three silver fish on a black field.',
        sv: 'Sköld B — tre silverfiskar på svart fält.',
      },
    ],
    directions: {
      next: 'akkurat',
      copy: {
        en: 'Cross Slussen onto Söder. Ulla waits at Akkurat with the half of this story Movitz never dared write down.',
        sv: 'Korsa Slussen över till Söder. Ulla väntar på Akkurat med den halva av historien som Movitz aldrig vågade skriva ner.',
      },
      walking: {
        distance: '~900 m',
        minutes: 12,
        crossing: {
          en: 'Slussen — leaving Gamla Stan, entering Södermalm',
          sv: 'Slussen — lämnar Gamla Stan, in i Södermalm',
        },
        steps: {
          en: [
            'Leave Munkbron heading east along the Gamla Stan waterfront (Munkbroleden / Skeppsbron).',
            'Pass Kornhamnstorg square and continue to the Slussen junction.',
            'Cross Slussen on the marked pedestrian path — the lock between Lake Mälaren and the Baltic.',
            'On the Söder side, climb the slope (or take the stairs) up to Hornsgatan.',
            'Turn left onto Hornsgatan; Akkurat is ~150 m on the right at #18.',
          ],
          sv: [
            'Lämna Munkbron österut längs Gamla Stans strandkant (Munkbroleden / Skeppsbron).',
            'Passera Kornhamnstorg och fortsätt till korsningen vid Slussen.',
            'Korsa Slussen på den markerade gångbanan — slussen mellan Mälaren och Saltsjön.',
            'På Södersidan, gå upp för backen (eller ta trapporna) till Hornsgatan.',
            'Sväng vänster in på Hornsgatan; Akkurat ligger ~150 m till höger på nr 18.',
          ],
        },
        landmark: {
          en: 'Slussen lock · views back across to Gamla Stan',
          sv: 'Slussen · utsikt tillbaka mot Gamla Stan',
        },
        note: {
          en: '⚠ Slussen is undergoing major reconstruction. Pedestrian routes change frequently — follow the temporary signs and add a few minutes.',
          sv: '⚠ Slussen byggs om i stor skala. Gångvägarna ändras ofta — följ de tillfälliga skyltarna och lägg till några minuter.',
        },
        google: 'https://www.google.com/maps/dir/?api=1&origin=Munkbron+11,+Stockholm&destination=Akkurat,+Hornsgatan+18,+Stockholm&travelmode=walking',
        apple: 'https://maps.apple.com/?saddr=Munkbron+11,+Stockholm&daddr=Hornsgatan+18,+Stockholm&dirflg=w',
      },
    },
  },

  /* ===================================================================
     STOP 4 — Akkurat
     Witness: Ulla Winblad · Beat: Heart — the Lover's Confession
     Mechanic: acrostic cipher (read gilt letters → KVARNEN)
     =================================================================== */
  {
    id: 'akkurat',
    num: 4,
    title: 'Akkurat',
    address: 'Hornsgatan 18, Södermalm',
    witness: 'Ulla Winblad',
    beat: {
      en: "Heart — the Lover's Confession",
      sv: 'Hjärtat — älskarinnans bikt',
    },
    intro: {
      en: 'Belgian beer temple, legendary whisky shelf. A small glass of punsch arrives unbidden.',
      sv: 'Belgiskt öltempel, legendarisk whiskyhylla. Ett litet glas punsch kommer obeställt till bordet.',
    },
    walkMinutes: 12,
    mapsQuery: 'Akkurat, Hornsgatan 18, Stockholm',
    story: {
      en: `(A small glass of Swedish punsch lands at your table. The bartender nods at the folded note beside it. The handwriting is a woman's.)

I knew him, friends. Don't pretend to be shocked.

I knew him before any of them — before he was a traitor, when he was only a boy with a fortune and a laugh and a way of saying "Ulla" that no one else has matched.

Ulrik. His name was Ulrik.

The other men plotted. He paid. I was in the next room and I heard everything and I said nothing because I loved him, and I have hated myself for it ever since.

Sing my verse last, or sing it never. Either is mercy.
— Ulla

(A postscript, in fainter ink:) He gave me this once, in his own hand. I never could read it sober. Perhaps you can. The answer is where you must go next.`,
      sv: `(Ett litet glas svensk punsch landar på ert bord. Bartendern nickar mot den vikta lappen bredvid. Handstilen är en kvinnas.)

Jag kände honom, vänner. Spela inte chockad.

Jag kände honom före de andra — innan han blev förrädare, när han bara var en pojke med en förmögenhet och ett skratt och ett sätt att säga "Ulla" som ingen annan har matchat.

Ulrik. Han hette Ulrik.

De andra männen smidde planer. Han betalade. Jag stod i rummet intill och hörde allt och sa ingenting för att jag älskade honom, och jag har hatat mig själv för det sedan dess.

Sjung min vers sist, eller aldrig. Båda är nåd.
— Ulla

(En efterskrift, i blekare bläck:) Han gav mig den här en gång, i egen hand. Jag kunde aldrig läsa den nykter. Kanske kan ni. Svaret är dit ni måste gå härnäst.`,
    },
    verse: {
      en: `Ulrik, my love, my faithless gilded snake,
You poured the powder, struck for fashion's sake.
I bear no name now — only this small song —
Forgive me, friends, for loving him so long.`,
      sv: `Ulrik, min älskling, min trolöse förgyllde orm,
du hällde krutet, slog för modets norm.
Jag bär nu inget namn — blott denna lilla visa —
förlåt mig, vänner, att jag honom så länge fick prisa.`,
    },
    keepsake: 'ULRIK',
    witnessNote: {
      en: "Ulla: 'Ulrik. His name was ULRIK. The other men plotted. He paid. I was in the next room and I heard everything.'",
      sv: 'Ulla: "Ulrik. Han hette ULRIK. De andra smidde planer. Han betalade. Jag stod i rummet intill och hörde allt."',
    },
    puzzle: {
      type: 'acrostic',
      prompt: {
        en: 'Read only the gilded letters, in order. Where does Ulla send you?',
        sv: 'Läs endast de förgyllda bokstäverna, i tur och ordning. Vart skickar Ulla dig?',
      },
      // Lines with the gilded letter marked by [X]; renderer underlines / gilts them.
      // The marked letters, read top-to-bottom, spell KVARNEN in both languages.
      stanza: {
        en: [
          '[K]linger the bells, and lanterns shine bright,',
          'Soft falls the dust on the [V]iolet night,',
          '[A] way to the mill where the miller sings,',
          'While the [R]iver beneath us its silver brings.',
          'And [N]orth of the bridge, where the bottle softly rings,',
          '[E]ach toast leads us further from the kingdom of names —',
          'A[N]d there, on the hill, the great wheel still claims.',
        ],
        sv: [
          '[K]lockorna klingar, och lyktorna lyser så klart,',
          'I det [v]ioletta mörker, dammet faller, sakta och snart,',
          '[A]llt leder oss bort till den mal som rör sig så,',
          'Och [R]innande älven sin silverbåge slå.',
          '[N]orr om bron, där flaskan klingar i hand,',
          'Vid v[e]rkligheten av varje skål, vi lämnar kungens land —',
          'Och där, på höge[n], står det stora hjulet, evigt brand.',
        ],
      },
      // Accept the Swedish name, the English meaning, and trivial casings.
      accept: ['kvarnen', 'the mill', 'mill', 'kvarn'],
      canonical: 'KVARNEN',
      altMessage: {
        en: "Yes — that's what it means. The Swedish name is KVARNEN.",
        sv: 'Ja — det är vad det betyder. På svenska heter den KVARNEN.',
      },
      successMsg: {
        en: "The mill on Söder. Where Bellman sang loudest, and where the song, if it is to be sung at all, must be sung. Go on. I'll wait here, with the punsch.",
        sv: 'Kvarnen på Söder. Där Bellman sjöng högst, och där sången, om den alls ska sjungas, måste sjungas. Gå nu. Jag väntar här, med punschen.',
      },
    },
    hints: [
      {
        en: 'Read only the gilded letters, in order, top to bottom.',
        sv: 'Läs endast de förgyllda bokstäverna, i ordning, uppifrån och ner.',
      },
      {
        en: "It's a famous beer hall on Söder. Seven letters. Starts with K.",
        sv: 'Det är ett berömt ölhus på Söder. Sju bokstäver. Börjar på K.',
      },
      {
        en: "K-V-A-R-N-E-N. Swedish for 'the mill.'",
        sv: 'K-V-A-R-N-E-N. Svenska för "mölnan / kvarnen".',
      },
    ],
    directions: {
      next: 'kvarnen',
      copy: {
        en: "Tjärhovsgatan 4. The grand Söder beer hall. Bellman waits at the long table — what's left of him.",
        sv: 'Tjärhovsgatan 4. Det stora ölhuset på Söder. Bellman väntar vid det långa bordet — det som finns kvar av honom.',
      },
      walking: {
        distance: '~700 m',
        minutes: 9,
        steps: {
          en: [
            'Exit Akkurat onto Hornsgatan and turn right (east), back toward Slussen.',
            'At the next major junction, turn right onto Götgatan and head south.',
            'Walk Götgatan three blocks (~400 m). Medborgarplatsen — Söder\u2019s big square — opens up on your left.',
            'Turn left onto Tjärhovsgatan, just past Medborgarplatsen.',
            'Kvarnen is on the right at #4. Push through the heavy oak doors into the long hall.',
          ],
          sv: [
            'Gå ut från Akkurat på Hornsgatan och sväng höger (österut), tillbaka mot Slussen.',
            'I nästa större korsning, sväng höger in på Götgatan och gå söderut.',
            'Gå längs Götgatan tre kvarter (~400 m). Medborgarplatsen — Söders stora torg — öppnar sig till vänster.',
            'Sväng vänster in på Tjärhovsgatan, strax efter Medborgarplatsen.',
            'Kvarnen ligger på höger sida på nr 4. Tryck upp de tunga ekdörrarna och in i den långa hallen.',
          ],
        },
        landmark: {
          en: 'Götgatan (Söder\u2019s main artery) · Medborgarplatsen',
          sv: 'Götgatan (Söders huvudstråk) · Medborgarplatsen',
        },
        note: null,
        google: 'https://www.google.com/maps/dir/?api=1&origin=Hornsgatan+18,+Stockholm&destination=Kvarnen,+Tj%C3%A4rhovsgatan+4,+Stockholm&travelmode=walking',
        apple: 'https://maps.apple.com/?saddr=Hornsgatan+18,+Stockholm&daddr=Tj%C3%A4rhovsgatan+4,+Stockholm&dirflg=w',
      },
    },
  },

  /* ===================================================================
     STOP 5 — Kvarnen
     Witness: Carl Michael Bellman · Beat: Reveal & Reconstruction
     Mechanic: fill-in-the-blanks (combine all four prior keepsakes + 1 new)
     =================================================================== */
  {
    id: 'kvarnen',
    num: 5,
    title: 'Kvarnen',
    address: 'Tjärhovsgatan 4, Södermalm',
    witness: 'Carl Michael Bellman',
    beat: {
      en: 'Reveal & Reconstruction',
      sv: 'Avslöjandet & återställandet',
    },
    intro: {
      en: 'A grand 1908 beer hall. The poet himself, faintly, at the head of the long table.',
      sv: 'Ett stort ölhus från 1908. Skalden själv, otydligt, vid kortändan av det långa bordet.',
    },
    walkMinutes: 9,
    mapsQuery: 'Kvarnen, Tjärhovsgatan 4, Stockholm',
    story: {
      en: `(The four collected verses lie on the broadside before you. At the head of the long table, a candle that has not been lit, beside a fiddle no one has touched.)

You have brought me four verses, friends. The fifth I never finished — I lost the words at the bottom of one too many cups. Help me end it.

You have all you need. Look at what you carried here. (And if memory fails — Mollberg muttered something tonight about a horse. Open your Witness Notes if you must. The night never stalls.)`,
      sv: `(De fyra insamlade verserna ligger på bladet framför dig. Vid kortändan av det långa bordet står ett ljus som inte har tänts, bredvid en fiol som ingen har rört.)

Ni har burit fyra verser till mig, vänner. Den femte slutförde jag aldrig — jag tappade orden i botten av en bägare för mycket. Hjälp mig att avsluta den.

Ni har allt ni behöver. Se vad ni burit hit. (Och om minnet sviker — Mollberg muttrade något ikväll om en häst. Öppna era vittnesanteckningar om ni måste. Natten står aldrig still.)`,
    },
    verse: {
      en: `And so — the masked one bore the name I dread:
Baron Sillström. Ulrik. Now he, too, is dead —
Fell from his horse near Skanstull, so they said.
(I do not ask who pushed. I drink instead.)

His coat was red, his flask bore a herring —
Carl Michael writes, then drinks, then writes again —
Bury this verse, or sing it, gentlemen.`,
      sv: `Och så — den maskerade bar det namn jag fruktar:
Baron Sillström. Ulrik. Nu är även han stupad —
föll av sin häst vid Skanstull, så de sade.
(Jag frågar ej vem som knuffade. Jag dricker i stället.)

Hans rock var röd, hans plunta bar en sill —
Carl Michael skriver, så dricker, så skriver igen —
Begrav denna vers, eller sjung den, mina vänner.`,
    },
    keepsake: 'SKANSTULL', // awarded when the player drops it from the new-words tray
    witnessNote: {
      en: "Bellman: 'Baron Ulrik Sillström, who fell from his horse near Skanstull. I do not ask who pushed. I drink instead.'",
      sv: 'Bellman: "Baron Ulrik Sillström, som föll av sin häst vid Skanstull. Jag frågar ej vem som knuffade. Jag dricker i stället."',
    },
    puzzle: {
      type: 'fill-blanks',
      prompt: {
        en: 'Drop the right keepsake into each blank. The unused one is a souvenir of the night.',
        sv: 'Släpp rätt minne i varje lucka. Det som blir över är en souvenir från kvällen.',
      },
      // Verse split into chunks; each `slot` is a blank with a tag and the correct answer.
      template: {
        en: [
          { text: 'And so — the masked one bore the name I dread:\nBaron ' },
          { slot: { id: 1, tag: 'family name (from Stop 3)', answer: 'SILLSTRÖM' } },
          { text: '. ' },
          { slot: { id: 2, tag: 'given name (from Stop 4)', answer: 'ULRIK' } },
          { text: '. Now he, too, is dead —\nFell from his horse near ' },
          { slot: { id: 3, tag: 'place of his death (from Witness Notes)', answer: 'SKANSTULL' } },
          { text: ', so they said.\n(I do not ask who pushed. I drink instead.)\n\nHis coat was red, his flask bore a ' },
          { slot: { id: 4, tag: 'heraldic creature (from Stop 2)', answer: 'HERRING' } },
          { text: ' —\nCarl Michael writes, then drinks, then writes again —\nBury this verse, or sing it, gentlemen.' },
        ],
        sv: [
          { text: 'Och så — den maskerade bar det namn jag fruktar:\nBaron ' },
          { slot: { id: 1, tag: 'släktnamn (från Stopp 3)', answer: 'SILLSTRÖM' } },
          { text: '. ' },
          { slot: { id: 2, tag: 'förnamn (från Stopp 4)', answer: 'ULRIK' } },
          { text: '. Nu är även han stupad —\nföll av sin häst vid ' },
          { slot: { id: 3, tag: 'platsen för hans död (från Vittnesanteckningar)', answer: 'SKANSTULL' } },
          { text: ', så de sade.\n(Jag frågar ej vem som knuffade. Jag dricker i stället.)\n\nHans rock var röd, hans plunta bar en ' },
          { slot: { id: 4, tag: 'heraldiskt djur (från Stopp 2)', answer: 'HERRING' } },
          { text: ' —\nCarl Michael skriver, så dricker, så skriver igen —\nBegrav denna vers, eller sjung den, mina vänner.' },
        ],
      },
      // Words to populate the tray. ANGEL is decoy ("Chekhov's gun that doesn't fire").
      // SKANSTULL is awarded when the player opens Witness Notes.
      decoyMessage: {
        en: 'No, no — that was where we began, not where we end. (ANGEL stays in the tray, a souvenir.)',
        sv: 'Nej, nej — där började vi, inte där slutar vi. (ANGEL stannar i brickan, en souvenir.)',
      },
      successMsg: {
        en: 'Yes. That is the name. The song is whole at last.',
        sv: 'Ja. Det är namnet. Sången är äntligen hel.',
      },
    },
    hints: [
      {
        en: 'Each slot is tagged with the stop where you earned its answer. Open your Clue Tray.',
        sv: 'Varje lucka är märkt med stoppet där du tjänade in svaret. Öppna din ledtrådsbricka.',
      },
      {
        en: 'Slot 3 — Mollberg muttered something about a horse, near a place called SKANSTULL. Open your Witness Notes from Stop 2.',
        sv: 'Lucka 3 — Mollberg muttrade något om en häst, vid en plats som hette SKANSTULL. Öppna dina vittnesanteckningar från Stopp 2.',
      },
      {
        en: '1: SILLSTRÖM · 2: ULRIK · 3: SKANSTULL · 4: HERRING · ANGEL stays unused.',
        sv: '1: SILLSTRÖM · 2: ULRIK · 3: SKANSTULL · 4: HERRING · ANGEL stannar oanvänd.',
      },
    ],
    directions: null, // finale handles the ending
  },
];

export const TOTAL_STOPS = STOPS.length;

export function getStop(id) {
  return STOPS.find((s) => s.id === id) || null;
}

export function getStopByNum(num) {
  return STOPS.find((s) => s.num === Number(num)) || null;
}

/**
 * The full reconstructed Epistle 83, for the finale's Songbook.
 * Assembled from each stop's `verse` (bilingual) plus a bilingual closing.
 * (Source: STORY_BIBLE.md §6.)
 */
export const FULL_EPISTLE = {
  title: 'Fredmans Epistel N:o 83',
  subtitle: {
    en: 'Till Ulla, om en förrädare  ·  (To Ulla, concerning a traitor)',
    sv: 'Till Ulla, om en förrädare',
  },
  // Each entry is a bilingual { en, sv } object — pick() at render time.
  verses: STOPS.map((s) => s.verse),
  closing: {
    en: `"Drick ur ditt glas — se Döden på dig väntar."
(Drink up your glass — see, Death awaits you.)
— and so do I, friends. And so do I.`,
    sv: `"Drick ur ditt glas — se Döden på dig väntar."
— och så gör även jag, vänner. Så gör även jag.`,
  },
};
