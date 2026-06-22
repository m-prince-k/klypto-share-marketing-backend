async function calculateUltimateOscillator(candles, params) {
    
      const  length1 = params?.length1 || 7;
       const length2 = params?.length2 || 14;
       const length3 = params?.length3  || 28;

    const bpArr = [];   // Buying Pressure
    const trArr = [];   // True Range
    const result = [];
    const series = [];

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const prevClose = i > 0 ? candles[i - 1].close : c.close;

        const high_ = Math.max(c.high, prevClose);
        const low_ = Math.min(c.low, prevClose);

        const bp = c.close - low_;
        const tr = high_ - low_;

        bpArr.push(bp);
        trArr.push(tr);

        function average(bpArr, trArr, length) {
            if (i < length - 1) return null;
            const bpSlice = bpArr.slice(i - length + 1, i + 1);
            const trSlice = trArr.slice(i - length + 1, i + 1);
            const sumBP = bpSlice.reduce((a, b) => a + b, 0);
            const sumTR = trSlice.reduce((a, b) => a + b, 0);
            return sumTR === 0 ? 0 : sumBP / sumTR;
        }

        const avg7 = average(bpArr, trArr, length1);
        const avg14 = average(bpArr, trArr, length2);
        const avg28 = average(bpArr, trArr, length3);

        const uo = (avg7 === null || avg14 === null || avg28 === null) 
            ? null 
            : 100 * (4 * avg7 + 2 * avg14 + avg28) / 7;

        series.push({ time: c.time, uo: uo, ultimate: uo });
    }

    return series;
}

module.exports = { calculateUltimateOscillator };