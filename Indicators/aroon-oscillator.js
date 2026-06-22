/**
 * Aroon Oscillator
 * Pine Equivalent:
 * osc = aroonUp - aroonDown
 *
 * @param {Array<Object>} candles
 * [{open, high, low, close, volume}]
 *
 * @param {number} length (default 14)
 *
 * @returns {Array<Object>}
 * Per candle:
 * {
 *   open,
 *   high,
 *   low,
 *   close,
 *   volume,
 *   aroonOsc
 * }
 */

async function calculateAroonOscillator(candles, options) {
    const length = options?.length || 14;
    if (!candles || candles?.length === 0) return ({message:"candle should not be empty"});

    const result = [];

    for (let i = 0; i < candles.length; i++) {

        if (i < length - 1) {
            result.push({
                ...candles[i],
                aroonOsc: null
            });
            continue;
        }

        // Lookback window
        const start = i - length;
        let highestHigh = -Infinity;
        let lowestLow = Infinity;
        let barsSinceHigh = 0;
        let barsSinceLow = 0;

        for (let j = start; j <= i; j++) {

            if (candles[j]?.high >= highestHigh) {
                highestHigh = candles[j].high;
                barsSinceHigh = i - j;
            }

            if (candles[j]?.low <= lowestLow) {
                lowestLow = candles[j].low;
                barsSinceLow = i - j;
            }
        }

        const aroonUp = ((length - barsSinceHigh) / length) * 100;
        const aroonDown = ((length - barsSinceLow) / length) * 100;


        const oscillator = aroonUp - aroonDown;

  
            result.push({
                time:candles[i].time,
                aroonOsc: oscillator
            });
     
    }

    return result;
}
module.exports={calculateAroonOscillator}