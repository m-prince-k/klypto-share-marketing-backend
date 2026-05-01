const { calculateEMAIndicator } = require("./EMA");

async function calculateDEMA(candles, options) {

    const length = options?.length || 9;

    // ✅ FIX: await lagao
    const ema1 = await calculateEMAIndicator(candles, options);
    
    const ema1Values = ema1.map(c => c.ema);

    // Create fake candles for EMA2
    const emaCandles = candles.map((c, i) => ({
        ...c,
        close: ema1Values[i]
    }));

    // ✅ FIX: yaha bhi await lagao
    const ema2 = await calculateEMAIndicator(emaCandles, options);

    const ema2Values = ema2.map(c => c.ema);

    const result = candles.map((c, i) => {

        let value = null;

        if (ema1Values[i] != null && ema2Values[i] != null) {
            value = 2 * ema1Values[i] - ema2Values[i];
        }

        return {
            time: c.time,
            dema: value
        };
    });

    return result;
}

module.exports = { calculateDEMA };