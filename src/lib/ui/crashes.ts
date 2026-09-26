/**
 * crashes.ts — počítadlo pádů přes GoatCounter (§52)
 *
 * Chyby, které testeři nenahlásí: nezachycená výjimka v prohlížeči, selhání
 * překreslení stolu nebo AI. Každá se pošle do GoatCounteru jako anonymní
 * událost — cesta `error/<druh>/<zpráva>`, v titulku verze a místo v kódu
 * (jen název souboru a řádek). Nic o hráči: žádné jméno, žádná adresa, žádný
 * stav hry; zpráva se navíc zbaví adres URL, e-mailů a dlouhých čísel.
 *
 * Aby hra v nouzi nezahltila statistiky: každá chyba se za načtení stránky
 * pošle jednou a nejvýš `max` různých. GoatCounter se načítá asynchronně —
 * co přijde dřív, počká ve frontě, dokud jeho `count` není k dispozici.
 */

export interface CrashEvent {
  path: string;
  title: string;
  event: true;
}

type Count = (e: CrashEvent) => void;

/** Zpráva chyby bez čehokoli, co by mohlo nést osobní údaj. */
export function cleanMessage(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\d{5,}/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '(bez zprávy)';
}

/** Místo v kódu: jen název souboru a řádek (ne celá adresa). */
export function codeLocation(file: string | undefined, line?: number, col?: number): string {
  if (!file) return '';
  const base = file.split(/[?#]/)[0].split('/').pop() ?? '';
  return [base, line, col].filter((x) => x !== undefined && x !== '' && x !== 0).join(':');
}

/** První rámec zásobníku, který patří naší stránce, jako „soubor:řádek:sloupec". */
function stackLocation(err: unknown): string {
  const stack = err instanceof Error ? err.stack ?? '' : '';
  const m = /(https?:\/\/[^\s)]+?):(\d+):(\d+)/.exec(stack);
  return m ? codeLocation(m[1], Number(m[2]), Number(m[3])) : '';
}

export function crashEvent(kind: string, err: unknown, version: string, where = ''): CrashEvent {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const loc = where || stackLocation(err);
  return {
    path: `error/${kind}/${cleanMessage(message)}`,
    title: `Flek! ${version}${loc ? ` @ ${loc}` : ''}`,
    event: true,
  };
}

export class CrashCounter {
  private readonly sent = new Set<string>();
  private readonly queue: CrashEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waited = 0;

  constructor(
    private readonly count: () => Count | null,
    private readonly version: string,
    private readonly max = 5,
  ) {}

  report(kind: string, err: unknown, where = ''): void {
    const ev = crashEvent(kind, err, this.version, where);
    if (this.sent.has(ev.path) || this.sent.size >= this.max) return;
    this.sent.add(ev.path);
    this.queue.push(ev);
    this.flush();
  }

  /** Pošle frontu, jakmile je GoatCounter načtený; zkouší ~30 s, pak to vzdá. */
  private flush(): void {
    const count = this.count();
    if (count !== null) {
      for (const ev of this.queue.splice(0)) {
        try { count(ev); } catch { /* statistika nesmí shodit hru */ }
      }
      return;
    }
    if (this.timer !== null || this.waited >= 30_000) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.waited += 2000;
      this.flush();
    }, 2000);
  }
}

let installed: CrashCounter | null = null;

/** Hlášení z kódu, který chybu zachytil sám (render, AI). Mimo prohlížeč nic nedělá. */
export function reportCrash(kind: string, err: unknown): void {
  installed?.report(kind, err);
}

/** Zapne počítadlo: nezachycené chyby a odmítnuté promisy v okně. */
export function installCrashCounter(win: Window, version: string): CrashCounter {
  const counter = new CrashCounter(() => {
    const gc = (win as Window & { goatcounter?: { count?: Count } }).goatcounter;
    return typeof gc?.count === 'function' ? (e) => gc.count?.(e) : null;
  }, version);
  win.addEventListener('error', (ev) => {
    counter.report('window', ev.error ?? ev.message, codeLocation(ev.filename, ev.lineno, ev.colno));
  });
  win.addEventListener('unhandledrejection', (ev) => counter.report('promise', ev.reason));
  installed = counter;
  return counter;
}
