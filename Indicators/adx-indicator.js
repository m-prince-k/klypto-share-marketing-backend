
async function calculateADX(candles, params) {

    const dilen = params?.diLength ?? 14; // DI Length
    const adxlen = params?.smoothing ?? 14; // ADX smoothing length

    if (!Array.isArray(candles)) return [];
    const highs = await candles.map(c => c.high);
    const lows = await candles.map(c => c.low);

    const plusDM = [];
    const minusDM = [];
    const trueRange = [];

    // Calculate directional movements and true range
    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            plusDM.push(0);
            minusDM.push(0);
            trueRange.push(highs[i] - lows[i]);
            continue;
        }

        const up = highs[i] - highs[i - 1];
        const down = lows[i - 1] - lows[i];

        plusDM.push(up > down && up > 0 ? up : 0);
        minusDM.push(down > up && down > 0 ? down : 0);

        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - candles[i - 1].close),
            Math.abs(lows[i] - candles[i - 1].close)
        );
        trueRange.push(tr);
    }

    // RMA / SMMA helper
    function rma(arr, length) {
        const result = [];
        arr.forEach((val, i) => {
            if (i === 0) result.push(val);
            else result.push((result[i - 1] * (length - 1) + val) / length);
        });
        return result;
    }

    const trRMA = rma(trueRange, dilen);
    const plusRMA = rma(plusDM, dilen);
    const minusRMA = rma(minusDM, dilen);

    // Calculate DI values
    const plusDI = plusRMA.map((val, i) => (trRMA[i] === 0 ? 0 : (100 * val) / trRMA[i]));
    const minusDI = minusRMA.map((val, i) => (trRMA[i] === 0 ? 0 : (100 * val) / trRMA[i]));

    // Calculate ADX
    const adxRaw = plusDI.map((plus, i) => {
        const minus = minusDI[i];
        const sum = plus + minus === 0 ? 1 : plus + minus;
        return (Math.abs(plus - minus) / sum) * 100;
    });

    const adx = rma(adxRaw, adxlen);

    const result = candles.map((c, i) => ({
        time:c.time,
        plusDI: plusDI[i],
        minusDI: minusDI[i],
        ADX: adx[i],
    }));

    return result;
}

// Example usage:

module.exports = { calculateADX }
// const adxData = calculateADX(candles, { dilen: 14, adxlen: 14 });