# Flek! — mariáš in the browser

🇬🇧 **English** · 🇨🇿 **[Česky](#česky)**

A modern browser tribute to **FLEK!** (1991–92) and **RE!** (1993), two DOS card
games written in Turbo Pascal by **Ing. Jaroslav Pivoňka** (Pivoňka Software).
They played _mariáš_, the Czech trick-taking game for three players that is
still the standard card game of Czech pubs.

The engine is a pure reducer in TypeScript, the two opponents are a heuristic
plus an Information-Set Monte Carlo tree search running in a Web Worker, and the
whole thing is a static page with no backend (the only request that leaves the
page is a GoatCounter hit counter, allowed by name in a strict CSP).

Live site: **[flek.saiko.cz](https://flek.saiko.cz)** · current version
**0.0.20**, see [`CHANGELOG.md`](CHANGELOG.md) and the
[releases](https://github.com/dsaiko/flek/releases)

![The opening screen: pick between the chosen and the auction variant](docs/screenshot-intro.jpg)

This project is dedicated to my father, **Josef Saiko**, who loved mathematics.

## The game

Mariáš is played with 32 German-suited cards (acorns, leaves, hearts, bells;
seven through ace) by three players: one **declarer** against two **defenders**.
The declarer takes the talon, discards two cards and commits to a contract; the
defenders may double it. Ten tricks are played, aces and tens are worth ten
points each, the last trick another ten, and a king with the ober of the same
suit is worth 20 (40 in trumps) when its holder announces it while playing the
first card of the pair. The ten sits just below the ace **only in games with a
trump**; in betl and durch it is a lower card than the unter of the same suit,
and the hand is sorted the way the tricks are judged.

Two variants ship, both playable from the opening screen:

| Variant                  | Original | How the contract is decided                                                                                                    |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Chosen** (volený)      | FLEK!    | Forehand picks the trump from their first seven cards (or blind, from the second five), asks the defenders whether a colour game stands, and announces the contract only after they answer. A defender may instead take the talon, discard, and only then declare betl or durch; an announced betl can still be taken over with durch. |
| **Auction** (licitovaný) | RE!      | Players bid for the contract; a higher commitment beats a lower one, and the winner takes the talon.                           |

Beyond the plain game, players commit to **seven** (winning the last trick with
the trump seven), **hundred** (scoring 100 points or more), **betl** (losing
every trick) and **durch** (winning every one). Each component is doubled
independently through the _flek_ ladder — flek, re, tutti, boty, and in the chosen
variant kalhoty (the auction rules stop at the fourth) — and a red trump doubles
the colour contracts again.

The UI speaks Czech, English, German and French, and the money is kept across
hands in a running account that survives a reload. The question mark at the
bottom left opens an in-game help with the rules in plain language, links to the
official ones, the tributes and the card attribution — in all four languages.

Around the table:

- the opponents talk: short remarks in speech bubbles (a polite and a pub set),
  plus synthesised sounds, both switchable in the settings;
- **Vše za mnou** ("the rest is mine") appears when nobody can take another
  trick from you, and **Nic za mnou** in betl when you cannot take one any
  more; the rest of the hand is then played out card by card. Both are decided
  from what you can see, never from the other hands;
- bids and declarations are a compact ladder of tiles (`7`, `100`, `100+7`,
  betl, durch) that fits on one line in every language;
- risky discards (an ace or a ten into the talon, breaking a marriage) and a
  pass that would cost money without a card played ask for confirmation.
- **Report a bug** (the bug icon, or the ☰ menu on a phone) opens an email to
  flek@saiko.cz with the description, the version, the device and a compressed
  record of the current hand; `pbpaste | npx tsx scripts/report.ts` (the whole
  email on stdin — never on the command line) turns the record back into a
  save that replays the hand exactly.

**On a phone** the table fills the screen and switches to a portrait layout
when held upright. Browsers that can go full screen do so from the toolbar
button; Safari on iPhone cannot, so there the button explains how to add the
game to the home screen (Share → Add to Home Screen), from where it starts full
screen without the browser bars. On Android, "Install app" does the same.

### Rules

The engine follows the **official rules of the Czech Mariáš Association**
(Český svaz mariáše) for the part of the game it implements: three-handed
chosen and auction mariáš, played for money. This repository does not
redistribute the rules; these links point to the documents at their own
source:

- [Obecná pravidla hry mariáš 2009](https://www.csm1986.cz/public/CMS_Materialy/00_Spolecne_pro_vsechny_druhy_mariase/Dokumenty_CMS/Obecna_pravidla_hry_marias_2009.pdf) — the general rules, on the association's own site
- [Pravidla dvacetihaléřového bodovaného voleného mariáše](https://www.talon.cz/pravidla/mari%C3%A1%C5%A1_pravidla_volen%C3%BD.pdf) — the chosen variant
- [Pravidla soutěžního licitovaného mariáše (2014)](https://www.talon.cz/pravidla/mari%C3%A1%C5%A1_pravidla_licitovan%C3%BD_2014.pdf) — the auction variant
- [Český svaz mariáše](https://www.csm1986.cz/) — the association itself

Where the original games disagree with those rules, the association wins by
default and the FLEK! behaviour goes behind a config switch. Every such decision
is recorded in [`docs/marias-design.md`](docs/marias-design.md), which is the
living design document for the whole project.

What the rules describe and this engine deliberately does not do:

- the **two sevens** contract of the auction variant, and with it the "mistake"
  by which a player who bid a seven they do not hold folds the hand;
- **laydown hands**: spotting that a contract cannot be lost is solving the
  hand rather than settling it, and the rules then split the difference among
  the players who flekked. The 500x/750x limit is applied, that split is not;
- **tournament machinery**: premium points, the fourth player sitting a hand
  out, cutting and stacking the cards, and most of the renonces;
- a player raises **one component per click** and keeps the word while they
  have something left to say, where the rules let them answer every part of
  the contract in one breath.

In English, the game is usually called **Marriage**; the [pagat.com description
of mariáš](https://www.pagat.com/marriage/marias.html) is a good introduction.

## Original work and references

- [FLEK! playable in the browser](https://www.retrogames.cz/play_448-DOS.php?language=CZ) at retrogames.cz
- FLEK! v1.12 © 1991, 1992 and RE! © 1993 Ing. Jaroslav Pivoňka, Pivoňka Software

This is an independent reimplementation, not a port. The repository contains
**no original executable and no original code**; the games were used as a
reference for the feel of the table and for default rates, and what was
observed is written down in [`docs/original-notes.md`](docs/original-notes.md).
One thing was deliberately not reproduced: the original AI was widely said to
peek at the other hands. Here the opponents receive a redacted view, and that
is checked rather than promised: a test walks every field of every player's
view against the cards that player may not know, and the seed the search runs
on is drawn independently of the one that shuffled the deck, so nothing in the
request points back to the deal.

It is a redaction, not a cryptographic guarantee. The shuffle still comes from
a 32-bit seed, so a determined search could enumerate the deals consistent with
a known hand. Nothing here does that; the point is that the opponents are given
no shortcut, and what they are given is all they have.

## Run locally

Needs Node 24. The browser tests also need the Playwright browsers once:
`npx playwright install chromium webkit`.

```bash
make setup
make dev
```

Checks and build:

```bash
make verify        # tests without a browser: engine and rules, AI fairness,
                   # saves, UI logic, card sets, the CSP step, the CI guard
make build         # typecheck + static build into dist/
make smoke         # browser tests (Playwright: Chromium + WebKit, desktop and phone sizes)
make all           # verify + build + smoke
make preview       # serve dist/ on 127.0.0.1:8083
make capture       # regenerate the README screenshot
make cards         # regenerate the two modern SVG decks (committed output)
make help          # every target
```

Every pull request into `main` runs `make all` in GitHub Actions
([`ci.yml`](.github/workflows/ci.yml)); pushing a `v*` tag runs it again and
publishes the GitHub release ([`release.yml`](.github/workflows/release.yml))
with the notes taken from the matching section of `CHANGELOG.md`.

URL parameters:

- `?seed=10` deals the same cards every time, and subsequent hands continue
  from that seed;
- `?lang=cs|en|de|fr` picks the language (otherwise the browser's, then the
  last one used);
- `?sazby=flek` plays for the rates of the original FLEK!/RE! instead of the
  association's.

## Architecture

```text
src/lib/cards.ts               card encoding, orders, points
src/lib/rules/types.ts         GameState, Phase, PlayerAction, Contract, Sazby
src/lib/rules/legal.ts         legalActions() — the single source of legality
src/lib/rules/engine.ts        apply(state, action) → state, invariants
src/lib/rules/tricks.ts        who wins a trick, follow / overtake / trump
src/lib/rules/scoring.ts       settlement, per-component, zero sum
src/lib/rules/sazby.ts         rates (ČSM and FLEK!), per-variant config
src/lib/rules/view.ts          view(state, seat) → PlayerView, hides other hands
src/lib/rules/claim.ts         "vše za mnou" / "nic za mnou", from the view only
src/lib/ai/heuristics.ts       hand evaluation for every auction decision
src/lib/ai/determinize.ts      deals consistent with what a seat knows
src/lib/ai/ismcts.ts           Information-Set MCTS for card play
src/worker/ai.worker.ts        the AI off the main thread
src/lib/match/controller.ts    match loop, autosave, AI scheduling
src/lib/match/persist.ts       save format, deep validation, migrations
src/lib/ui/table.ts            the table: rendering, animations, popups
src/lib/ui/tableTalk.ts        what the opponents say, and when
src/lib/ui/i18n.ts             the four languages
src/scripts/main.ts            wiring: settings, toolbar, full screen
src/pages/index.astro          the page and all of its CSS
scripts/csp.ts                 replaces 'unsafe-inline' with hashes after the build
scripts/verify.ts              tests without a browser
scripts/smoke.ts               browser tests
```

Three decisions shape everything else:

**`legalActions(view)` is the only place that knows the rules.** `apply()`
validates an action by membership in that list rather than deriving legality a
second time, so the UI, the AI and the validator cannot drift apart.

**`apply()` is pure and deterministic**, which makes a match a fold over its
history: `history.reduce(apply, dealtState)`. Replay, autosave and a future
multiplayer server all fall out of that one property.

**The AI only ever sees a `PlayerView`.** Fair play is enforced by construction,
and the same redacted object is what a server would send to a remote client.

The table is sized from the **height of the felt** (`container-type: size` plus
`cqh` units), because the layout is height-constrained: the opponents, the trick
and your hand have to fit above each other. The proportions therefore hold in a
window, in fullscreen and at other aspect ratios. On a desktop the frame keeps
a fixed 1400/900 ratio, so its width is capped by the window height as well —
the whole table has to fit on screen without scrolling, and a smoke test checks
exactly that at 1440x900. On phones, low landscape screens, in portrait and in
full screen the frame drops the ratio and fills the screen; the smoke test
checks five phone and tablet sizes for overlaps.

## Cards

- `cards/history/` — scans of a single-headed Prague pattern deck printed
  around 1860 by Ant. Kratochvíl, Prague. **Public domain**, via
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Jednohlave)
  (original scans: Bibliothèque nationale de France, Gallica).
- `cards/modern-barevna/` (**Modern coloured** — the whole card in its suit
  colour, readable from the narrowest strip of a fan) and `cards/modern-lidova/`
  (**Modern folk** — cream paper, serif type, double-headed court cards). Two
  original SVG decks with international J / Q / K / A indices, generated by
  [`scripts/gen-cards.ts`](scripts/gen-cards.ts) after a Claude Design board,
  **MIT licensed**. Edit the generator, not the files (`make cards`; a test
  checks the committed files match the generator).

## Deployment

The site has its own private S3 bucket behind CloudFront. `make deploy` builds,
uploads `dist/` to `s3://flek.saiko.cz/` (hashed assets first, `index.html`
last), invalidates the distribution, waits for it, and only then deletes files
the new build no longer has — so a page still open on the old version keeps its
scripts. `make deploy-s3-dryrun` shows what would change. Cache headers and the
security headers come from CloudFront response headers policies.

`Makefile.local` (not in the repository) sets `AWS_PROFILE`, `S3_BUCKET` (must
be exactly `flek.saiko.cz`) and `CLOUDFRONT_DIST`. Deployment is manual and does
not run the tests — deploy a commit that passed `make all`; tagging a release
does not touch the site.

## License

The code in this repository is MIT licensed. FLEK!, RE! and the original work
remain the work of Ing. Jaroslav Pivoňka. The rules of mariáš belong to no one;
the specific wording of the association's documents belongs to the association,
which is why they are linked rather than copied.

---

<a id="česky"></a>

## Česky

Moderní browserová pocta hrám **FLEK!** (1991–92) a **RE!** (1993), které
v Turbo Pascalu napsal **Ing. Jaroslav Pivoňka** (Pivoňka Software). Hraje se
mariáš pro tři hráče — volený i licitovaný — podle **oficiálních pravidel
Českého svazu mariáše**, na která se odkazuje (nekopírují se sem, je to cizí
dílo). Engine je čistý reducer v TypeScriptu, protihráči jsou heuristika plus
ISMCTS ve Web Workeru a celé je to statická stránka bez backendu.

Věnováno mému otci, **Josefu Saikovi**, který miloval matematiku.

Živý web: **[flek.saiko.cz](https://flek.saiko.cz)** · verze **0.0.20**
([změny](CHANGELOG.md))

Hra mluví česky, anglicky, německy a francouzsky, konto se přenáší mezi hrami
a přežije i obnovení stránky. Soupeři u stolu prohodí slovo, v sehrávce se
nabízí **Vše za mnou** a v betlu **Nic za mnou** (obojí se počítá jen z toho,
co hráč vidí). Na telefonu se stůl roztáhne přes celou obrazovku a na výšku se
přeskládá; na iPhonu jde celá obrazovka jen z plochy (Sdílet → Přidat na
plochu), tlačítko celé obrazovky to v Safari vysvětlí.

Potřebuje Node 24; pro browser testy jednou `npx playwright install chromium webkit`.

```bash
make setup
make dev
make all           # verify + build + smoke
make capture       # znovu vytvoří snímek pro README
make help          # všechny cíle
```

Každý pull request do `main` spustí `make all` v GitHub Actions; tag `v*`
vydá release s textem z `CHANGELOG.md`. Na web se nasazuje ručně přes
`make deploy` (bez testů — nasazuje se commit, který prošel `make all`), tag
vydání web nemění.

Rozdání jde zopakovat seedem v URL: `?seed=10` rozdá pokaždé stejné karty;
`?lang=en` přepne jazyk, `?sazby=flek` hraje o sazby originálu.
Živý návrhový dokument je [`docs/marias-design.md`](docs/marias-design.md),
pozorované chování originálu [`docs/original-notes.md`](docs/original-notes.md).

Kód je pod MIT. FLEK! a RE! zůstávají dílem Ing. Jaroslava Pivoňky; originální
binárky v repu nejsou a tenhle projekt není jejich port, ale samostatná
implementace. Na rozdíl od originálu tady AI do cizích karet nevidí — dostává
jen redigovaný `PlayerView`, a hlídá to test, který prochází celý pohled i seed
hledání. Podporovaná podmnožina pravidel a vědomé odchylky jsou popsané výš
v anglické části a v [`docs/marias-design.md`](docs/marias-design.md).
