/**
 * Aroon Indicator using candle data
 * @param {Array<Object>} candles - array of candle objects {time, open, high, low, close}
 * @param {Object} options - { length: number }
 * @returns {Array<Object>} - array of objects with time, aroonUp, aroonDown, and chart-friendly value entries
 */
async function calculateAroonFromCandles(candles, options) {
    const length = options?.length || 14;

    // Chart data arrays
    const aroonUpSeries = [];
    const aroonDownSeries = [];

    // TradingView-style window: exactly `length` bars (including current bar)
    function barsSinceHighest(currentIndex) {
        let highestValue = -Infinity;
        let barsSince = 0;
        for (let i = 0; i < length; i++) {
            const idx = currentIndex - i;
            if (idx < 0) break;
            if (candles[idx].high > highestValue) {
                highestValue = candles[idx].high;
                barsSince = i;
            }
        }
        return barsSince;
    }

    function barsSinceLowest(currentIndex) {
        let lowestValue = Infinity;
        let barsSince = 0;
        for (let i = 0; i < length; i++) {
            const idx = currentIndex - i;
            if (idx < 0) break;
            if (candles[idx].low < lowestValue) {
                lowestValue = candles[idx].low;
                barsSince = i;
            }
        }
        return barsSince;
    }

    for (let i = 0; i < candles.length; i++) {
        if (i < length - 1) {
            aroonUpSeries.push({ time: candles[i].time, value: null });
            aroonDownSeries.push({ time: candles[i].time, value: null });
            continue;
        }

        const hiBars = barsSinceHighest(i);
        const loBars = barsSinceLowest(i);

        const aroonUp = 100 * (length - hiBars) / length;
        const aroonDown = 100 * (length - loBars) / length;

        aroonUpSeries.push({ time: candles[i].time, value: aroonUp });
        aroonDownSeries.push({ time: candles[i].time, value: aroonDown });
    }

    return { aroonUpSeries, aroonDownSeries };
}

module.exports = { calculateAroonFromCandles };