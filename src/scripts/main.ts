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
import { currentLang, t } from '../lib/ui/i18n';
import { TableUI } from '../lib/ui/table';

// ── nastavení ────────────────────────────────────────────────────────────────

interface Settings {
  variant: Variant;
  difficulty: Difficulty;
  pattern: Pattern;
}

const SETTINGS_KEY = 'flek.settings.v1';

const DEFAULT_SETTINGS: Settings = { variant: 'voleny', difficulty: 'normal', pattern: 'history' };

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
}, {
  onAction: (action) => {
    try { controller.dispatch(action); } catch (e) { console.error(e); }
  },
  onDeal: () => controller.dealNext(),
  onNewMatch: () => newMatch(),
});

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

const variantSel = $('set-variant') as HTMLSelectElement;
const difficultySel = $('set-difficulty') as HTMLSelectElement;
const patternSel = $('set-pattern') as HTMLSelectElement;
variantSel.value = settings.variant;
difficultySel.value = settings.difficulty;
patternSel.value = settings.pattern;

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
