/**
 * main.ts — DOM bootstrap hry (jediné místo, kde se lepí UI ↔ match ↔ worker)
 */

import type { Difficulty } from '../lib/ai/heuristics';
import { MatchController } from '../lib/match/controller';
import { clearMatch, loadMatch, saveMatch } from '../lib/match/persist';
import { createSeedSequence, parseSeedParam } from '../lib/match/seedSequence';
import { createWorkerDriver } from '../lib/match/workerDriver';
import { defaultConfig } from '../lib/rules/sazby';
import type { GameState, Variant } from '../lib/rules/types';
import type { Pattern } from '../lib/ui/cardAssets';
import { createSounds } from '../lib/ui/sounds';
import type { TalkSet } from '../lib/ui/tableTalk';
import { currentLang, t } from '../lib/ui/i18n';
import { TableUI } from '../lib/ui/table';

// ── nastavení ────────────────────────────────────────────────────────────────

interface Settings {
  variant: Variant;
  difficulty: Difficulty;
  pattern: Pattern;
  talk: TalkSet;
  sounds: boolean;
}

const SETTINGS_KEY = 'flek.settings.v1';

const DEFAULT_SETTINGS: Settings = {
  variant: 'voleny', difficulty: 'normal', pattern: 'history', talk: 'slusna', sounds: true,
};

/** Nastavení z localStorage může být poškozené nebo cizí — ověř každou hodnotu. */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      variant: p.variant === 'voleny' || p.variant === 'licitovany' ? p.variant : DEFAULT_SETTINGS.variant,
      difficulty: p.difficulty === 'easy' || p.difficulty === 'normal' || p.difficulty === 'hard'
        ? p.difficulty : DEFAULT_SETTINGS.difficulty,
      pattern: p.pattern === 'modern' || p.pattern === 'history' ? p.pattern : DEFAULT_SETTINGS.pattern,
      talk: p.talk === 'slusna' || p.talk === 'hospodska' || p.talk === 'vulgarni' || p.talk === 'off'
        ? p.talk : DEFAULT_SETTINGS.talk,
      sounds: typeof p.sounds === 'boolean' ? p.sounds : DEFAULT_SETTINGS.sounds,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ── bootstrap ────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`#${id} nenalezen`);
  return el;
};

const settings = loadSettings();
const driver = createWorkerDriver();
const variantSel = $('set-variant') as HTMLSelectElement;
const sounds = createSounds(settings.sounds);

/*
 * Autoplay policy: AudioContext se smí rozjet až po gestu uživatele; do té doby
 * se zvuky tiše zahazují (§5.7).
 *
 * Posluchače schválně NEJSOU `{ once: true }`: prohlížeč kontext uspí i bez nás
 * (tab na pozadí, zamčený displej, jiná aplikace si vezme zvuk) a s jediným
 * pokusem o odemčení by zvuk po návratu zůstal mrtvý až do konce session.
 * `unlock()` je idempotentní a při vypnutém zvuku neudělá nic.
 */
for (const event of ['pointerdown', 'keydown'] as const) {
  document.addEventListener(event, () => sounds.unlock());
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sounds.unlock();
});

// ?seed=NNN → deterministická rozdání (testy, sdílení zajímavých rozdání);
// další hry v zápase dostávají seed+1, seed+2, … (logika v seedSequence.ts)
const seeds = createSeedSequence(parseSeedParam(location.search));
const randomSeed = (): number => seeds.next();

const BUDGETS: Record<Difficulty, number> = { easy: 300, normal: 1000, hard: 2200 };

let controller: MatchController;

function makeController(resume?: GameState): MatchController {
  const mc = new MatchController(driver, {
    config: defaultConfig(settings.variant),
    humanSeat: 0,
    difficulty: settings.difficulty,
    budgetMs: BUDGETS[settings.difficulty],
    seedSource: randomSeed,
    autosave: saveMatch,
    aiDelayMs: 650,
    autoGood: true,
  }, resume);
  mc.onChange((state) => table.render(state));
  return mc;
}

const table = new TableUI($('table'), {
  humanSeat: 0,
  pattern: () => settings.pattern,
  talk: () => settings.talk,
  sounds,
}, {
  onAction: (action) => {
    try { controller.dispatch(action); } catch (e) { console.error(e); }
  },
  onDeal: () => controller.dealNext(),
  onNewMatch: () => newMatch(),
  onVariant: (variant) => {
    if (settings.variant === variant) return;
    settings.variant = variant;
    variantSel.value = variant;
    saveSettings(settings);
    newMatchIdle(); // zůstaň na úvodní obrazovce, jen s jinou variantou
  },
});

/** Nový zápas, ale bez rozdání — úvodní obrazovka s vybranou variantou. */
function newMatchIdle(): void {
  controller?.stop();
  clearMatch();
  table.reset();
  controller = makeController();
  table.render(controller.state);
}

function newMatch(): void {
  controller?.stop();
  clearMatch();
  table.reset(); // opuštěné animace starého zápasu nesmí blokovat nový
  controller = makeController();
  controller.dealNext();
}

// resume rozehraného zápasu
const saved = loadMatch();
if (saved && saved.config.variant === settings.variant && saved.phase.name !== 'idle') {
  if (window.confirm(t('resume'))) {
    seeds.resumeAfter(saved.handNo);
    controller = makeController(saved);
    table.render(controller.state);
    controller.kick();
  } else {
    clearMatch();
    controller = makeController();
    table.render(controller.state);
  }
} else {
  controller = makeController();
  table.render(controller.state);
}

// ── ovládací prvky ───────────────────────────────────────────────────────────

const difficultySel = $('set-difficulty') as HTMLSelectElement;
const patternSel = $('set-pattern') as HTMLSelectElement;
const talkSel = $('set-talk') as HTMLSelectElement;
const soundsSel = $('set-sounds') as HTMLSelectElement;
variantSel.value = settings.variant;
difficultySel.value = settings.difficulty;
patternSel.value = settings.pattern;
talkSel.value = settings.talk;
soundsSel.value = settings.sounds ? 'on' : 'off';

variantSel.addEventListener('change', () => {
  settings.variant = variantSel.value as Variant;
  saveSettings(settings);
  newMatch();
});
difficultySel.addEventListener('change', () => {
  settings.difficulty = difficultySel.value as Difficulty;
  saveSettings(settings);
  newMatch(); // obtížnost od příštího zápasu — jednoduché a předvídatelné
});
patternSel.addEventListener('change', () => {
  settings.pattern = patternSel.value as Pattern;
  saveSettings(settings);
  table.render(controller.state);
});

talkSel.addEventListener('change', () => {
  settings.talk = talkSel.value as TalkSet;
  saveSettings(settings);
  table.render(controller.state); // hlášky se projeví hned, zápas běží dál
});
soundsSel.addEventListener('change', () => {
  settings.sounds = soundsSel.value === 'on';
  saveSettings(settings);
  sounds.setEnabled(settings.sounds);
  if (settings.sounds) {
    sounds.unlock();
    sounds.play('deal'); // slyšitelné potvrzení, že se zvuk zapnul
  }
});

$('btn-new').addEventListener('click', () => newMatch());

// fullscreen (iOS Safari neumí requestFullscreen na divu → CSS fallback)
const gameSection = $('game-section');
$('btn-fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (gameSection.requestFullscreen) {
    try { await gameSection.requestFullscreen(); } catch { gameSection.classList.toggle('fs-fallback'); }
  } else {
    gameSection.classList.toggle('fs-fallback');
  }
});

// texty v <option> neumí CSS přepínání (.cs/.en spany) — přepisuje je JS
function updateControlLabels(): void {
  const set = (sel: HTMLSelectElement, labels: Record<string, string>) => {
    for (const opt of Array.from(sel.options)) {
      const label = labels[opt.value];
      if (label) opt.textContent = label;
    }
  };
  set(variantSel, { voleny: t('voleny'), licitovany: t('licitovany') });
  set(patternSel, { modern: t('modern'), history: t('history') });
  set(talkSel, { slusna: t('talkPolite'), hospodska: t('talkPub'), vulgarni: t('talkVulgar'), off: t('talkOff') });
  set(soundsSel, { on: t('soundOn'), off: t('soundOff') });
  void currentLang();
}
updateControlLabels();

// přepnutí jazyka (lang-pill v Layoutu) → překreslit herní texty i ovládání
new MutationObserver(() => {
  updateControlLabels();
  table.render(controller.state);
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});
