/**
 * sounds.ts — jemné zvuky u stolu (docs/marias-design.md §5.7)
 *
 * Zvuky se **syntetizují** ve Web Audio, nestahují se žádné samply. Důvody:
 * karty jsou šum a ťuknutí, což se dá udělat přesvědčivě pár uzly; nepřibude
 * žádný soubor do `public/` ani žádná cizí licence k dohledání; a nic se
 * nemusí načítat, takže první zvuk nikdy nepřijde pozdě. Kdybychom později
 * chtěli skutečné nahrávky, vymění se implementace `play()`, ne volající.
 *
 * Autoplay policy: `AudioContext` smí hrát až po gestu uživatele. Do té doby
 * se zvuky **tiše zahazují** — žádná výjimka, žádný záznam v konzoli.
 */

export type SoundName =
  | 'deal' // jedna karta při rozdávání (šustění)
  | 'play' // položení karty na stůl
  | 'trick' // sebrání štychu
  | 'flek' // ťuknutí na stůl při fleku
  | 'win'
  | 'lose';

export interface Sounds {
  play: (name: SoundName) => void;
  setEnabled: (on: boolean) => void;
  /**
   * Zavolat z prvního gesta uživatele (klik na „Rozdat").
   *
   * Vrací příslib, který dojde, až je kontext opravdu probuzený. `resume()` je
   * asynchronní, takže `play()` hned po `unlock()` by ještě narazilo na uspaný
   * kontext a zvuk by tiše zahodilo — kdo chce hrát rovnou z gesta, počká si.
   */
  unlock: () => Promise<void>;
}

type Ctor = new () => AudioContext;

/** Tichý dublér — pro Node testy a pro prohlížeče bez Web Audio. */
export const silentSounds: Sounds = {
  play: () => {},
  setEnabled: () => {},
  unlock: () => Promise.resolve(),
};

/** Hlasitost je schválně nízko: „jemné, tiché, bez hudby" (§5.7). */
const MASTER_GAIN = 0.22;

export function createSounds(enabled = true): Sounds {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (Ctx === undefined) return silentSounds;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let on = enabled;
  /** Proběhlo gesto uživatele? Bez něj kontext ani nezakládáme (viz níže). */
  let unlocked = false;
  /** Safari potřebuje v gestu skutečně něco přehrát (viz `unlock`). */
  let primed = false;

  const ensure = (): AudioContext | null => {
    if (ctx === null) {
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
      } catch {
        return null; // prohlížeč kontext odmítl — hrajeme dál potichu
      }
    }
    return ctx;
  };

  /** Krátký šum (karty, míchání) přes pásmovou propust s obálkou. */
  const noise = (
    c: AudioContext,
    out: AudioNode,
    { dur, freq, q = 1, gain = 1, sweepTo }: {
      dur: number; freq: number; q?: number; gain?: number; sweepTo?: number;
    },
  ): void => {
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, c.currentTime);
    if (sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur);
    }
    filter.Q.value = q;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, c.currentTime);
    env.gain.exponentialRampToValueAtTime(gain, c.currentTime + Math.min(0.012, dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);

    src.connect(filter).connect(env).connect(out);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  };

  /** Tón s krátkou obálkou (ťuknutí do stolu, konec hry). */
  const tone = (
    c: AudioContext,
    out: AudioNode,
    { freq, dur, type = 'sine', gain = 0.5, delay = 0, glideTo }: {
      freq: number; dur: number; type?: OscillatorType; gain?: number; delay?: number; glideTo?: number;
    },
  ): void => {
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  return {
    setEnabled: (value) => { on = value; },
    unlock: () => {
      // Vypnutý zvuk nesmí otevřít AudioContext: na mobilu tím probouzí zvukovou
      // relaci zařízení uživateli, který si zvuk výslovně vypnul.
      if (!on) return Promise.resolve();
      unlocked = true;
      const c = ensure();
      if (c === null) return Promise.resolve();
      /*
       * Příslib se jen zapamatuje a vrátí na konci — čekat se na něj tady nesmí:
       * odemykací ťuknutí níž musí zaznít PŘÍMO v gestu uživatele, a po `await`
       * už by běželo v jiném úkolu, kde ho Safari neuzná.
       */
      const resumed = c.state !== 'running' ? c.resume().catch(() => {}) : Promise.resolve();
      /*
       * Safari (a starší iOS) kontext neodemkne samotným `resume()` — dokud
       * v něm PŘÍMO v gestu něco nezahraje, zůstane potichu, i když hlásí
       * stav 'running'. Přehrajeme proto jednorámcový ticháč; jinde nemá
       * žádný efekt.
       */
      if (!primed) {
        primed = true;
        try {
          const src = c.createBufferSource();
          src.buffer = c.createBuffer(1, 1, c.sampleRate);
          src.connect(c.destination);
          src.start(0);
        } catch {
          /* nevadí — zvuk se zkusí znovu při dalším gestu */
        }
      }
      return resumed;
    },
    play: (name) => {
      /*
       * Dokud neproběhlo gesto, kontext vůbec nezakládáme — samotné `new
       * AudioContext()` bez aktivace uživatele vypíše v Chrome varování
       * a §5.7 slibuje, že v konzoli nebude nic. (Nastane např. při obnovení
       * zápasu na obrazovce vyúčtování, kde chce hrát zvuk konce hry.)
       */
      if (!on || !unlocked) return;
      const c = ensure();
      if (c === null || master === null) return;
      if (c.state !== 'running') {
        /*
         * Prohlížeč kontext uspí i bez nás (tab na pozadí, zamčený displej,
         * jiná aplikace si vezme zvuk). Bez tohohle pokusu o probuzení by zvuk
         * po návratu na kartu zůstal mrtvý až do konce session.
         */
        void c.resume().catch(() => {});
        return;
      }
      try {
        switch (name) {
          case 'deal':
            noise(c, master, { dur: 0.05, freq: 2600, q: 1.4, gain: 0.32 });
            break;
          case 'play':
            noise(c, master, { dur: 0.08, freq: 1800, sweepTo: 900, q: 1.1, gain: 0.45 });
            break;
          case 'trick':
            noise(c, master, { dur: 0.24, freq: 900, sweepTo: 2200, q: 0.9, gain: 0.35 });
            break;
          case 'flek':
            // klouby o desku: tupý náraz + cvaknutí
            tone(c, master, { freq: 150, glideTo: 70, dur: 0.13, type: 'triangle', gain: 0.6 });
            noise(c, master, { dur: 0.05, freq: 1200, q: 0.8, gain: 0.4 });
            break;
          case 'win':
            tone(c, master, { freq: 660, dur: 0.12, type: 'triangle', gain: 0.4 });
            tone(c, master, { freq: 880, dur: 0.18, type: 'triangle', gain: 0.4, delay: 0.1 });
            break;
          case 'lose':
            tone(c, master, { freq: 420, dur: 0.14, type: 'triangle', gain: 0.35 });
            tone(c, master, { freq: 300, dur: 0.22, type: 'triangle', gain: 0.35, delay: 0.12 });
            break;
        }
      } catch {
        /* jeden neúspěšný zvuk nesmí rozbít hru */
      }
    },
  };
}
