/**
 * Rate of Change (ROC) Indicator using candle data
 * @param {Array<Object>} candles - array of candle objects {open, high, low, close}
 * @param {number} length - lookback period (default 9)
 * @param {string} sourceType - which price to use: "close", "open", "high", "low"
 * @returns {Array<number>} - ROC values per candle
 */
/**
 * Rate of Change (ROC) Indicator using candle data
 */

async function calculatedROC(candles, options) {

    const len = options?.length || 9;
    const srcKey = options?.source || "close";

    const roc = [];

    // helper function to get price source
    const getSourceValue = (candle) => {

        switch (srcKey) {

            case "hl2":
                return (candle.high + candle.low) / 2;

            case "hlc3":
                return (candle.high + candle.low + candle.close) / 3;

            case "ohlc4":
                return (candle.open + candle.high + candle.low + candle.close) / 4;

            default:
                return candle[srcKey]; // open, high, low, close
        }
    };

    for (let i = 0; i < candles.length; i++) {

        if (i < len) {
            roc.push(null);
            continue;
        }

        const current = getSourceValue(candles[i]);
        const prev = getSourceValue(candles[i - len]);

        const value = ((current - prev) / prev) * 100;

        roc.push(value);
    }

    return candles.map((c, i) => ({
        time:c.time,
        roc: roc[i]
    }));
}

module.exports = { calculatedROC };