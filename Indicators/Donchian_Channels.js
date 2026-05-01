// ----------------------------- Donchian Channels -----------------------------

async function calculateDonchianChannels(candles, options) {

    const length = typeof options === 'number' ? options : (options?.length || 20);
    const offset = options?.offset || 0;
    const source = options?.inputIndicator || options?.source || null;

    const n = candles?.length;
    const result = [];

    for (let i = 0; i < n; i++) {

        const candleTime = candles[i].time; // capture candle time

        if (i < length - 1) {
            result.push({
                time: candleTime,
                donchian: null,
                upper: null,
                lower: null,
                basis: null
            });
            continue;
        }

        const slice = candles.slice(i - length + 1, i + 1);
        
        let highs, lows;
        if (source) {
            highs = slice.map(c => Number(c[source] ?? c.high));
            lows = slice.map(c => Number(c[source] ?? c.low));
        } else {
            highs = slice.map(c => Number(c.high));
            lows = slice.map(c => Number(c.low));
        }

        const upper = Math.max(...highs.filter(v => !isNaN(v)));
        const lower = Math.min(...lows.filter(v => !isNaN(v)));
        const basis = (upper + lower) / 2;

        result.push({
            time: candleTime,   // include the candle's timestamp
            donchian: basis,    // chart-friendly value
            upper,
            lower,
            basis
        });

    }

    return result;
}

module.exports = { calculateDonchianChannels };