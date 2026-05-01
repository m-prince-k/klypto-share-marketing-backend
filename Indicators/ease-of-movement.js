// --------------------------- Ease Of Movement (EOM) ---------------------------

async function calculateEOM(candles, params) {

    const length = params?.length ?? 14;
    const divisor = params?.divisor ?? 10000;

    const hl2 = candles.map(c => (c.high + c.low) / 2);
    const volume = candles.map(c => c.volume);

    const eomRaw = [];

    for (let i = 0; i < candles.length; i++) {

        if (i === 0) {
            eomRaw.push(null);
            continue;
        }

        const changeHL2 = hl2[i] - hl2[i - 1];
        const highLow = candles[i].high - candles[i].low;

        const vol = volume[i] === 0 ? 1 : volume[i];

        const eomValue = (divisor * changeHL2 * highLow) / vol;

        eomRaw.push(eomValue);
    }

    // ---- SMA of EOM ----

    const eomArray = [];

    for (let i = 0; i < candles.length; i++) {

        if (i + 1 < length) {
            eomArray.push(null);
            continue;
        }

        const sma =
            eomRaw
                .slice(i - length + 1, i + 1)
                .reduce((a, b) => a + (b || 0), 0) / length;

        eomArray.push(sma);
    }

    // ---- Chart friendly output ----

    return candles.map((c, i) => ({
        time:c.time,
        value: eomArray[i],
        eom: eomArray[i]
    }));
}

module.exports = { calculateEOM };