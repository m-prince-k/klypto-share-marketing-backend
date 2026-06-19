// ------------------------- Historical Volatility (HV) ---------------------------------

function calculateHistoricalVolatility(candles, options) {

    const length = options?.length || 10;
    const intraday = options?.intraday ?? true;
    const dailyMultiplier = options?.dailyMultiplier || 1;

    const annual = 365;
    const n = candles.length;

    const per = (intraday || dailyMultiplier === 1) ? 1 : 7;

    const result = [];

    for (let i = 0; i < n; i++) {

        let value = null;

        if (i >= length) {

            const logReturns = [];

            for (let j = i - length + 1; j <= i; j++) {
                const ret = Math.log(candles[j].close / candles[j - 1].close);
                logReturns.push(ret);
            }

            const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
            const variance = logReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / logReturns.length;
            const stdev = Math.sqrt(variance);

            // Annualized HV
            value = 100 * stdev * Math.sqrt(annual / per);
        }

        result.push({
            time: candles[i].time,
            historical_Vol: value
        });
    }

    return result;
}

module.exports = { calculateHistoricalVolatility };