// ------------------------------------ Chande Kroll Stop --------------------------------
 
async function calculateChandeKrollStop(candles, options) {
    const atrPeriod = options?.atrPeriod || 10;   // p
    const atrMultiplier = options?.atrMultiplier || 1; // x
    const stopLength = options?.stopLength || 9; // q
    const n = candles?.length;

    const atr = new Array(n).fill(0);

    // Helper: True Range
    function trueRange(i) {
        if (i === 0) return candles[0].high - candles[0].low;
        const curr = candles[i];
        const prev = candles[i - 1];
        return Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
    }

    // ATR using Wilder's smoothing
    for (let i = 0; i < n; i++) {
        if (i < atrPeriod) {
            const trSlice = [];
            for (let j = 0; j <= i; j++) trSlice.push(trueRange(j));
            atr[i] = trSlice.reduce((a, b) => a + b, 0) / trSlice.length;
        } else {
            atr[i] = (atr[i - 1] * (atrPeriod - 1) + trueRange(i)) / atrPeriod;
        }
    }

    const firstHighStop = new Array(n).fill(0);
    const firstLowStop = new Array(n).fill(0);
    const stopShort = new Array(n).fill(0);
    const stopLong = new Array(n).fill(0);

    // Calculate first high/low stop
    for (let i = 0; i < n; i++) {
        const highSlice = candles.slice(Math.max(0, i - atrPeriod + 1), i + 1).map(c => c.high);
        const lowSlice  = candles.slice(Math.max(0, i - atrPeriod + 1), i + 1).map(c => c.low);
        const highestHigh = Math.max(...highSlice);
        const lowestLow = Math.min(...lowSlice);
        firstHighStop[i] = highestHigh - atrMultiplier * atr[i];
        firstLowStop[i] = lowestLow + atrMultiplier * atr[i];
    }

    // Calculate stopShort and stopLong
    for (let i = 0; i < n; i++) {
        const highSlice = firstHighStop.slice(Math.max(0, i - stopLength + 1), i + 1);
        const lowSlice  = firstLowStop.slice(Math.max(0, i - stopLength + 1), i + 1);
        stopShort[i] = Math.max(...highSlice);
        stopLong[i]  = Math.min(...lowSlice);
    }

    // Return candles with stop values
    return candles.map((c, i) => ({
        time:c.time,
        stopLong: stopLong[i],
        stopShort: stopShort[i]
    }));
}

// Example usage:

module.exports={calculateChandeKrollStop}

// const result = calculateChandeKrollStop(candles, { atrPeriod: 10, atrMultiplier: 1, stopLength: 9 });



