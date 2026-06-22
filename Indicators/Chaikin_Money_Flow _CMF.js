// --------------------------- Calculate Chaikin Money Flow (CMF) ------------------------

async function calculateCMF(candles, options) {
//length = 20
    const length = options?.length || 20;
    const n = candles.length;

    // Check if total volume exists
    if (!candles || candles.length === 0) return [];
    const totalVol = candles.reduce((acc, c) => acc + (c.volume || 0), 0);
    if (totalVol === 0) {
        throw new Error("No volume is provided by the data vendor.");
    }

    const cmfArray = [];

    for (let i = 0; i < n; i++) {

        let sumAD = 0;
        let sumVol = 0;

        for (let j = Math.max(0, i - length + 1); j <= i; j++) {

            const { high, low, close, volume } = candles[j];

            let ad = 0;

            if (!(close === high && close === low) && !(high === low)) {
                ad = ((2 * close - low - high) / (high - low)) * volume;
            }

            sumAD += ad;
            sumVol += volume;
        }

        const cmf = sumVol !== 0 ? sumAD / sumVol : 0;

        cmfArray.push(cmf);
    }

    // Return chart-friendly format
    return candles.map((c, i) => ({
        time:c.time,
        value: cmfArray[i],  // chart friendly
        cmf: cmfArray[i]
    }));
}

module.exports = { calculateCMF };