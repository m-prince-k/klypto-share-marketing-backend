async function calculateWilliamsR(candles, params) {

    const length = params?.length || 14;
    const sourceType = params?.source || "close";

    const result = [];

    // helper function to get source value
    const getSourceValue = (candle) => {

        switch (sourceType) {

            case "open":
                return candle.open;

            case "high":
                return candle.high;

            case "low":
                return candle.low;

            case "hl2":
                return (candle.high + candle.low) / 2;

            case "hlc3":
                return (candle.high + candle.low + candle.close) / 3;

            case "ohlc4":
                return (candle.open + candle.high + candle.low + candle.close) / 4;

            default:
                return candle.close;
        }
    };

    for (let i = 0; i < candles.length; i++) {

        if (i < length - 1) {
            result.push({
                time: candles[i].time,
                value: null,
                williamsr: null,
                williamPercentR: null
            });
            continue;
        }

        const slice = candles.slice(i - length + 1, i + 1);

        const highs = slice.map(c => c.high);
        const lows = slice.map(c => c.low);

        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);

        const src = getSourceValue(candles[i]);

        const percentR = highestHigh === lowestLow
            ? 0
            : 100 * (src - highestHigh) / (highestHigh - lowestLow);

        result.push({
            time: candles[i].time,
            value: percentR,
            williamsr: percentR,
            williamPercentR: percentR
        });
    }

    return result;
}

module.exports = { calculateWilliamsR };