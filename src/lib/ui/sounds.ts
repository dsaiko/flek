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
  | 'shuffle' // míchání balíčku
  | 'deal' // jedna karta při rozdávání
  | 'play' // položení karty na stůl
  | 'trick' // sebrání štychu
  | 'flek' // ťuknutí na stůl při fleku
  | 'win'
  | 'lose';

export interface Sounds {
  play: (name: SoundName) => void;
  setEnabled: (on: boolean) => void;
  /** Zavolat z prvního gesta uživatele (klik na „Rozdat"). */
  unlock: () => void;
}

type Ctor = new () => AudioContext;

/** Tichý dublér — pro Node testy a pro prohlížeče bez Web Audio. */
export const silentSounds: Sounds = {
  play: () => {},
  setEnabled: () => {},
  unlock: () => {},
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
      const c = ensure();
      if (c !== null && c.state === 'suspended') void c.resume().catch(() => {});
    },
    play: (name) => {
      if (!on) return;
      const c = ensure();
      if (c === null || master === null || c.state !== 'running') return; // před gestem ticho
      try {
        switch (name) {
          case 'shuffle':
            noise(c, master, { dur: 0.42, freq: 1400, sweepTo: 700, q: 0.7, gain: 0.5 });
            break;
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
