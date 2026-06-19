// ------------------ Chande Momentum Oscillator (CMO) ------------------

async function calculateChandeMO(candles, options) {
//length = 9, 
// srcKey = "close"
    const length = options?.length || 9;
    const srcKey = options?.source || "close";

    const src = candles.map(c => c[srcKey]);
    const result = [];

    for (let i = 0; i < src.length; i++) {

        let m1 = 0;
        let m2 = 0;

        // Compute sums over lookback period
        for (let j = Math.max(0, i - length + 1); j <= i; j++) {

            const change = j === 0 ? 0 : src[j] - src[j - 1];

            if (change >= 0) {
                m1 += change;
            } else {
                m2 += -change;
            }
        }

        const sumTotal = m1 + m2;

        const value = sumTotal === 0
            ? 0
            : 100 * (m1 - m2) / sumTotal;

        result.push({
            time: candles[i].time,
            cmo: value
        });
    }

    return result;
}

module.exports = { calculateChandeMO };