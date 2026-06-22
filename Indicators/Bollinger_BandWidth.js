// ---------------------Calculate Bollinger BandWidth (BBW) ------------------------------
 
async function calculateBBW(candles, options) {
    const length = options?.length || 20;
    const mult = options?.bbMult || 2.0;
    const expansionLength = options?.expansionLength || 125;
    const contractionLength = options?.contractionLength || 125;

    const n = candles?.length;
    const bbwArray = [];
    const highestExpArray = [];
    const lowestContArray = [];

    // Helper: SMA
    function sma(values) {
        const sum = values.reduce((a, b) => a + b, 0);
        return sum / values.length;
    }

    // Helper: Standard Deviation
    function stdev(values) {
        const mean = sma(values);
        const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
        return Math.sqrt(variance);
    }

    for (let i = 0; i < n; i++) {
        // Slice for current SMA/StdDev
        const start = Math.max(0, i - length + 1);
        const slice = candles.slice(start, i + 1).map(c => c.close);

        const basis = sma(slice);
        const dev = mult * stdev(slice);
        const upper = basis + dev;
        const lower = basis - dev;

        const bbw = ((upper - lower) / basis) * 100;
        bbwArray.push(bbw);

        // Highest Expansion
        const startExp = Math.max(0, i - expansionLength + 1);
        const sliceExp = bbwArray.slice(startExp, i + 1);
        const highestExp = Math.max(...sliceExp);
        highestExpArray.push(highestExp);

        // Lowest Contraction
        const startCont = Math.max(0, i - contractionLength + 1);
        const sliceCont = bbwArray.slice(startCont, i + 1);
        const lowestCont = Math.min(...sliceCont);
        lowestContArray.push(lowestCont);
    }

    // Return candles with BBW info
    return candles.map((c, i) => ({
        time:c.time,
        bbw: bbwArray[i],
        highestExpansion: highestExpArray[i],
        lowestContraction: lowestContArray[i]
    }));
}

// Example usage

module.exports={calculateBBW};
// const result = calculateBBW(candles, { length: 3, mult: 2, expansionLength: 3, contractionLength: 3 });


