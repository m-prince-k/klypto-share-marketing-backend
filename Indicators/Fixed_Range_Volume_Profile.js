function calculateFixedRangeVolumeProfile(candles, options) {

    if (!candles || candles.length === 0) return null;

    const from = options?.fromIndex;
    const to = options?.toIndex;
    const rows = options?.rows ?? 50;
    const valueAreaPercent = options?.valueAreaPercent ?? 0.7;

    if (from < 0 || to >= candles.length || from >= to) {
        throw new Error("Invalid range selected.");
    }

    // --- 1️⃣ Determine Range High & Low ---
    let rangeHigh = -Infinity;
    let rangeLow = Infinity;

    for (let i = from; i <= to; i++) {
        if (candles[i].high > rangeHigh) rangeHigh = candles[i].high;
        if (candles[i].low < rangeLow) rangeLow = candles[i].low;
    }

    const totalRange = rangeHigh - rangeLow;
    const rowHeight = totalRange / rows;

    // --- 2️⃣ Create Profile Buckets ---
    const profile = [];

    for (let r = 0; r < rows; r++) {
        profile.push({
            priceLow: rangeLow + r * rowHeight,
            priceHigh: rangeLow + (r + 1) * rowHeight,
            volume: 0
        });
    }

    // --- 3️⃣ Distribute Candle Volume ---
    for (let i = from; i <= to; i++) {

        const candle = candles[i];
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

    // --- 4️⃣ Find POC ---
    let pocRow = profile[0];

    for (let r = 1; r < rows; r++) {
        if (profile[r].volume > pocRow.volume) {
            pocRow = profile[r];
        }
    }

    const poc = (pocRow.priceLow + pocRow.priceHigh) / 2;

    // --- 5️⃣ Calculate Value Area ---
    const totalVolume = profile.reduce((sum, r) => sum + r.volume, 0);
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

    // --- Use last candle time of selected range ---
    const rangeTime = candles[to].time;

    return {
        ...candles[i],
        time: rangeTime,
        value: poc,   // main chart value
        poc,
        vah,
        val,
        high: rangeHigh,
        low: rangeLow,
        profile
    };
}

module.exports = { calculateFixedRangeVolumeProfile };