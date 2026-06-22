function calculateVisibleRangeVolumeProfile(candles, options) {

    if (!candles || candles.length === 0) return null;

    const from = options.visibleStartIndex;
    const to = options.visibleEndIndex;
    const rows = options.rows ?? 60;
    const valueAreaPercent = options.valueAreaPercent ?? 0.7;

    if (from < 0 || to >= candles.length || from >= to) {
        throw new Error("Invalid visible range.");
    }

    // ---- 1️⃣ Determine Visible High & Low ----
    let rangeHigh = -Infinity;
    let rangeLow = Infinity;

    for (let i = from; i <= to; i++) {
        if (candles[i].high > rangeHigh) rangeHigh = candles[i].high;
        if (candles[i].low < rangeLow) rangeLow = candles[i].low;
    }

    const totalRange = rangeHigh - rangeLow;
    const rowHeight = totalRange / rows;

    // ---- 2️⃣ Initialize Buckets ----
    const profile = [];

    for (let r = 0; r < rows; r++) {
        profile.push({
            priceLow: rangeLow + r * rowHeight,
            priceHigh: rangeLow + (r + 1) * rowHeight,
            volume: 0
        });
    }

    // ---- 3️⃣ Distribute Volume ----
    let totalVolume = 0;

    for (let i = from; i <= to; i++) {

        const candle = candles[i];
        totalVolume += candle.volume;

        const candleRange = candle.high - candle.low;
        if (candleRange === 0) continue;

        for (let r = 0; r < rows; r++) {

            const row = profile[r];

            const overlap =
                Math.min(candle.high, row.priceHigh) -
                Math.max(candle.low, row.priceLow);

            if (overlap > 0) {
                const proportionalVolume =
                    (overlap / candleRange) * candle.volume;

                row.volume += proportionalVolume;
            }
        }
    }

    // ---- 4️⃣ Find POC ----
    let pocRow = profile[0];

    for (let r = 1; r < rows; r++) {
        if (profile[r].volume > pocRow.volume) {
            pocRow = profile[r];
        }
    }

    const poc = (pocRow.priceLow + pocRow.priceHigh) / 2;

    // ---- 5️⃣ Calculate Value Area (70%) ----
    const targetVolume = totalVolume * valueAreaPercent;

    const sorted = [...profile].sort((a, b) => b.volume - a.volume);

    let cumulative = 0;
    const valueRows = [];

    for (let row of sorted) {
        cumulative += row.volume;
        valueRows.push(row);
        if (cumulative >= targetVolume) break;
    }

    const vah = Math.max(...valueRows.map(r => r.priceHigh));
    const val = Math.min(...valueRows.map(r => r.priceLow));

    return {
        poc,
        vah,
        val,
        high: rangeHigh,
        low: rangeLow,
        totalVolume,
        profile
    };
}

// Example Usage

module.exports={calculateVisibleRangeVolumeProfile}

// const visibleVP = calculateVisibleRangeVolumeProfile(candles, {
//     visibleStartIndex: 300,
//     visibleEndIndex: 550,
//     rows: 70,
//     valueAreaPercent: 0.7
// });