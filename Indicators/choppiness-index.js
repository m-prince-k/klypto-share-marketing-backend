// ------------------------- Choppiness Index (CHOP) -------------------------

async function calculateCHOP(candles, options) {
    // length = 14
    const length = options?.length || 14;
    const offset = options?.offset || 0; // ✅ OFFSET ADDED

    if (!candles || candles.length === 0) return [];

    const n = candles.length;
    const chop = new Array(n).fill(null);
    const tr = new Array(n).fill(null);

    // --- TRUE RANGE (ATR(1)) ---
    for (let i = 0; i < n; i++) {
        if (i === 0) {
            tr[i] = candles[i].high - candles[i].low;
        } else {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const range1 = high - low;
            const range2 = Math.abs(high - prevClose);
            const range3 = Math.abs(low - prevClose);

            tr[i] = Math.max(range1, range2, range3);
        }
    }

    // --- CHOP Calculation ---
    for (let i = length - 1; i < n; i++) {

        let atrSum = 0;
        for (let j = i - length + 1; j <= i; j++) {
            atrSum += tr[j];
        }

        let highestHigh = -Infinity;
        let lowestLow = Infinity;

        for (let j = i - length + 1; j <= i; j++) {
            if (candles[j].high > highestHigh) highestHigh = candles[j].high;
            if (candles[j].low < lowestLow) lowestLow = candles[j].low;
        }

        const denominator = highestHigh - lowestLow;

        chop[i] = denominator !== 0
            ? 100 * (Math.log10(atrSum / denominator) / Math.log10(length))
            : 0;
    }

    // --- APPLY OFFSET ---
    const shifted = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
        const newIndex = i + offset;

        if (newIndex >= 0 && newIndex < n) {
            shifted[newIndex] = chop[i];
        }
    }

    // --- Return time + value format ---
    return candles.map((c, i) => ({
        time: c.time,
        value: shifted[i],
        chop: shifted[i]
    }));
}

module.exports = { calculateCHOP };