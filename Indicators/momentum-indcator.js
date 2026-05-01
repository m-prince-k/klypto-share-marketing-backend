async function calculateMomentum(candles, params) {
    const length = params?.length || 10;
    const sourceType = params?.source || "close";

    const result = [];

    // helper to get source value
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

        if (i < length) {
            result.push({ ...candles[i], mom: null });
            continue;
        }

        const current = getSourceValue(candles[i]);
        const past = getSourceValue(candles[i - length]);

        const mom = current - past;

        result.push({
            time: candles[i].time,
            mom: mom
        });

    }

    return result;
}

module.exports = { calculateMomentum };