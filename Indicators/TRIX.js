// ---------------------------------- TRIX Indicator ----------------------------------

async function calculateTRIX(candles, options) {
//length = 18, 
// srcKey = "close"
    const length = options?.length || 18;
    const srcKey = options?.source || "close";

    const logClose = candles.map(c => Math.log(c[srcKey]));

    // Helper: EMA
    function ema(values, period) {

        const k = 2 / (period + 1);
        const result = [];

        let prevEma = values[0];
        result.push(prevEma);

        for (let i = 1; i < values.length; i++) {
            prevEma = values[i] * k + prevEma * (1 - k);
            result.push(prevEma);
        }

        return result;
    }

    // Triple EMA
    const ema1 = ema(logClose, length);
    const ema2 = ema(ema1, length);
    const ema3 = ema(ema2, length);

    const result = [];

    for (let i = 0; i < ema3.length; i++) {

        let value = 0;

        if (i > 0) {
            value = (ema3[i] - ema3[i - 1]) * 10000;
        }

        result.push({
            time: candles[i].time,
            trix: value
        });
    }

    return result;
}

module.exports = { calculateTRIX };