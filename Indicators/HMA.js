// ------------------- Hull Moving Average (HMA) -------------------

async function calculateHMA(candles, options) {

    const length = options?.length || 9;
    const srcKey = options?.source || "close";

    // Source resolver
    const getSourceValue = (c) => {

        switch (srcKey) {

            case "hl2":
                return (c.high + c.low) / 2;

            case "hlc3":
                return (c.high + c.low + c.close) / 3;

            case "ohlc4":
                return (c.open + c.high + c.low + c.close) / 4;

            case "hlcc4":
                return (c.high + c.low + c.close + c.close) / 4;

            default:
                return c[srcKey]; // close, open, high, low
        }
    };

    const src = candles.map(c => getSourceValue(c));

    const getWMA = (data, period) => {

        const wma = [];

        for (let i = 0; i < data.length; i++) {

            if (i + 1 < period) {
                wma.push(null);
                continue;
            }

            let numerator = 0;
            let denominator = 0;

            for (let j = 0; j < period; j++) {

                const weight = period - j; // correct WMA weight

                if (data[i - j] === null) {
                    numerator = null;
                    break;
                }

                numerator += data[i - j] * weight;
                denominator += weight;
            }

            wma.push(numerator === null ? null : numerator / denominator);
        }

        return wma;
    };

    // Step 1: WMA(length/2)
    const halfLen = Math.floor(length / 2);
    const wmaHalf = getWMA(src, halfLen);

    // Step 2: WMA(length)
    const wmaFull = getWMA(src, length);

    // Step 3: Difference
    const diff = src.map((_, i) => {
        if (wmaHalf[i] === null || wmaFull[i] === null) return null;
        return 2 * wmaHalf[i] - wmaFull[i];
    });

    // Step 4: WMA(sqrt(length))
    const sqrtLen = Math.floor(Math.sqrt(length));
    const hullma = getWMA(diff, sqrtLen);

    // Final result
    return candles.map((candle, i) => ({
        time: candle.time,
        hma: hullma[i]
    }));
}

module.exports = { calculateHMA };