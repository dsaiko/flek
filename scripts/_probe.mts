import { initialState, apply } from '../src/lib/rules/engine';
import { legalActions } from '../src/lib/rules/legal';
import { view } from '../src/lib/rules/view';
import { defaultConfig } from '../src/lib/rules/sazby';
import { think } from '../src/lib/ai/think';
import { Random } from '../src/lib/random';
import { CERVENE } from '../src/lib/cards';

let sedma = 0, kilo = 0, cerveny = 0, flekked = 0, both = 0, betl = 0;
const found: Record<string, number> = {};
for (let seed = 1; seed <= 120; seed += 1) {
  let s = apply(initialState(defaultConfig('licitovany'), 2), { type: 'deal', seed });
  let steps = 0;
  while (s.phase.name !== 'scored' && s.phase.name !== 'tricks' && steps < 300) {
    steps += 1;
    for (const seat of [0, 1, 2] as const) {
      const v = view(s, seat);
      if (legalActions(v).length === 0) continue;
      const { action } = think({ view: v, difficulty: 'easy', seed: Random.derive(seed, steps * 3 + seat), budgetMs: 0, iterations: 0 });
      s = apply(s, action);
      break;
    }
  }
  const c = s.contract;
  if (s.phase.name !== 'tricks' || !c) continue;
  const fl = s.history.filter((a) => a.type === 'flek').length;
  if (c.sedma !== null) { sedma += 1; if (!found.sedma) found.sedma = seed; }
  if (c.kilo !== null) { kilo += 1; if (!found.kilo) found.kilo = seed; }
  if (c.trump === CERVENE) { cerveny += 1; if (!found.cerveny) found.cerveny = seed; }
  if (fl > 0) { flekked += 1; if (!found.flek) found.flek = seed; }
  if (c.sedma !== null && fl > 0) { both += 1; if (!found.both) found.both = seed; }
  if (c.mode !== 'hra') { betl += 1; if (!found.betl) found.betl = seed; }
}
console.log({ sedma, kilo, cerveny, flekked, both, betl, found });
