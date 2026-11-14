/** How far back the rate looks: long enough to ride out one slow chunk, short enough to follow a stall. */
const WINDOW_MS = 5000;
/** Samples closer together than this add nothing but work. */
const SPACING_MS = 250;
/** Under this much of a run, the rate is a guess. */
const WARMUP_MS = 1000;

export interface Eta {
  /** Bytes so far: the seconds left, or null until there's enough to go on. */
  push(loaded: number, total: number): number | null;
  /** Start over, for a new download. */
  reset(): void;
}

/** Time left on a download, from how fast the last few seconds of it went. */
export function createEta(now: () => number = () => performance.now()): Eta {
  let samples: Array<[time: number, loaded: number]> = [];
  return {
    push(loaded, total) {
      const time = now();
      const last = samples[samples.length - 1];
      if (!last || time - last[0] >= SPACING_MS) samples.push([time, loaded]);
      while (samples.length > 2 && time - samples[1][0] >= WINDOW_MS) samples.shift();
      if (total <= 0) return null;
      if (loaded >= total) return 0;
      const [then, before] = samples[0];
      const span = time - then;
      if (span < WARMUP_MS || loaded <= before) return null;
      const perMs = (loaded - before) / span;
      return (total - loaded) / perMs / 1000;
    },
    reset() {
      samples = [];
    },
  };
}

/** "a few seconds left", "15 s left", "3 min left". */
export function formatTimeLeft(seconds: number): string {
  if (seconds < 5) return "a few seconds left";
  if (seconds < 55) {
    const s = seconds < 20 ? Math.ceil(seconds) : Math.ceil(seconds / 5) * 5;
    return `${s} s left`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes > 60 ? "over an hour left" : `${minutes} min left`;
}

/** "25 MB", "3.5 MB", "840 KB": a download's size, in the decimal units sizes are quoted in. */
export function formatDownload(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  if (bytes < 1e5) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  const mb = bytes / 1e6;
  return `${mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1))} MB`;
}

/** "12 of 27 MB", "50 KB of 4.9 MB": how far along a download is, the unit said once when it can be. */
export function formatProgress(loaded: number, total: number): string {
  const [a, b] = [formatDownload(Math.min(loaded, total)), formatDownload(total)];
  const unit = b.slice(b.indexOf(" "));
  return a.endsWith(unit) ? `${a.slice(0, -unit.length)} of ${b}` : `${a} of ${b}`;
}
