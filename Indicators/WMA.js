async function calculateWMA(candles, options) {

    const length = options?.length || 9;
    const source = options?.source || "close";
    const offset = options?.offset || 0;

    if (!candles || candles.length === 0) return [];

    // Source resolver
    const getSourceValue = (c) => {

        switch (source) {

            case "hl2":
                return (c.high + c.low) / 2;

            case "hlc3":
                return (c.high + c.low + c.close) / 3;

            case "ohlc4":
                return (c.open + c.high + c.low + c.close) / 4;

            case "hlcc4":
                return (c.high + c.low + c.close + c.close) / 4;

            default:
                return c[source]; // close, open, high, low
        }
    };

    const result = [];
    const denominator = (length * (length + 1)) / 2;

    for (let i = 0; i < candles.length; i++) {

        if (i < length - 1) {
            result.push({
                ...candles[i],
                time: candles[i].time,
                value: null
            });
            continue;
        }

        let weightedSum = 0;

        for (let j = 0; j < length; j++) {

            const weight = j + 1;
            const price = getSourceValue(candles[i - length + 1 + j]);

            weightedSum += price * weight;
        }

        const wma = weightedSum / denominator;

        result.push({
            time: candles[i].time,
            wma: wma
        });
    }

    return result;
}

module.exports = { calculateWMA };