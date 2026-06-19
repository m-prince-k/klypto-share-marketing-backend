function calculateSessionVolumeProfile(candles, options) {

    const start = options?.startIndex || 0;
    const end = options?.endIndex || candles.length - 1;
    const rows = options?.rows || 50;
    const valueAreaPercent = options?.valueAreaPercent || 0.7;

    if (!candles || candles.length === 0) return null;

    // --- 1️⃣ Find session high & low ---
    let sessionHigh = -Infinity;
    let sessionLow = Infinity;

    for (let i = start; i <= end; i++) {
        if (candles[i].high > sessionHigh) sessionHigh = candles[i].high;
        if (candles[i].low < sessionLow) sessionLow = candles[i].low;
    }

    const priceRange = sessionHigh - sessionLow;
    const rowHeight = priceRange / rows;

    // --- 2️⃣ Initialize profile rows ---
    const profile = [];

    for (let i = 0; i < rows; i++) {
        profile.push({
            priceLow: sessionLow + i * rowHeight,
            priceHigh: sessionLow + (i + 1) * rowHeight,
            volume: 0
        });
    }

    // --- 3️⃣ Distribute volume ---
    for (let i = start; i <= end; i++) {

        const candle = candles[i];
        const candleRange = candle.high - candle.low;

        if (candleRange === 0) continue;

        for (let r = 0; r < rows; r++) {

            const row = profile[r];

            const overlap =
                Math.min(candle.high, row.priceHigh) -
                Math.max(candle.low, row.priceLow);

            if (overlap > 0) {
                const volumeShare = (overlap / candleRange) * candle.volume;
                row.volume += volumeShare;
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

    // --- 5️⃣ Value Area (70%) ---
    const totalVolume = profile.reduce((sum, r) => sum + r.volume, 0);
    const targetVolume = totalVolume * valueAreaPercent;

    const sorted = [...profile].sort((a, b) => b.volume - a.volume);

    let cumulative = 0;
    const valueRows = [];

    for (let r of sorted) {
        cumulative += r.volume;
        valueRows.push(r);
        if (cumulative >= targetVolume) break;
    }

    const vah = Math.max(...valueRows.map(r => r.priceHigh));
    const val = Math.min(...valueRows.map(r => r.priceLow));

    // session last candle time
    const sessionTime = candles[end].time;

    return {
        time: sessionTime,
        value: poc,   // main value
        poc,
        vah,
        val,
        profile
    };
}

module.exports = { calculateSessionVolumeProfile };