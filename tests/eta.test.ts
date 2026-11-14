import { createEta, formatDownload, formatProgress, formatTimeLeft } from "../src/utils/eta";

describe("createEta", () => {
  it("waits a second before guessing, then goes by the recent rate", () => {
    let now = 0;
    const eta = createEta(() => now);
    expect(eta.push(0, 1000)).toBeNull();
    now = 500;
    expect(eta.push(50, 1000)).toBeNull();
    now = 1000;
    // 100 bytes a second, 900 to go.
    expect(eta.push(100, 1000)).toBeCloseTo(9);
    expect(eta.push(1000, 1000)).toBe(0);
  });

  it("follows a slowdown instead of averaging over the whole download", () => {
    let now = 0;
    const eta = createEta(() => now);
    for (; now <= 5000; now += 250) eta.push(now * 10, 1e6); // 10 KB/s
    for (; now <= 12000; now += 250) eta.push(50_000 + (now - 5000), 1e6); // 1 KB/s
    const left = eta.push(57_000, 1e6) as number;
    expect(left).toBeGreaterThan(800);
  });

  it("knows nothing without a total", () => {
    const eta = createEta(() => 5000);
    expect(eta.push(10, 0)).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it("rounds to what reads well", () => {
    expect(formatTimeLeft(2)).toBe("a few seconds left");
    expect(formatTimeLeft(12.2)).toBe("13 s left");
    expect(formatTimeLeft(31)).toBe("35 s left");
    expect(formatTimeLeft(58)).toBe("1 min left");
    expect(formatTimeLeft(150)).toBe("3 min left");
    expect(formatTimeLeft(4000)).toBe("over an hour left");
  });
});

describe("formatDownload", () => {
  it("says sizes in the decimal megabytes they're quoted in", () => {
    expect(formatDownload(0)).toBe("0 MB");
    expect(formatDownload(1_634)).toBe("2 KB");
    expect(formatDownload(3_660_000)).toBe("3.7 MB");
    expect(formatDownload(4_000_000)).toBe("4 MB");
    expect(formatDownload(25_890_000)).toBe("26 MB");
  });
});

describe("formatProgress", () => {
  it("says the unit once when both sides share it", () => {
    expect(formatProgress(12e6, 27e6)).toBe("12 of 27 MB");
    expect(formatProgress(840e3, 4.9e6)).toBe("0.8 of 4.9 MB");
    expect(formatProgress(50e3, 4.9e6)).toBe("50 KB of 4.9 MB");
    expect(formatProgress(30e6, 27e6)).toBe("27 of 27 MB");
  });
});
