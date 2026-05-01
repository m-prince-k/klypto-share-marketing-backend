// ---------------------- Ichimoku Cloud -------------------------------------------
 
async function calculateIchimoku(candles, options) {
    const conversionPeriods = options?.conversionLength || 9;
    const basePeriods = options?.baseLength || 26;
    const laggingSpan2Periods = options?.spanBLength || 52;
    const displacement = options?.laggingSpan || 26;

    const n = candles.length;

    function highest(slice) {
        return Math.max(...slice.map(c => c.high));
    }

    function lowest(slice) {
        return Math.min(...slice.map(c => c.low));
    }

    function donchian(startIndex, len) {
        const slice = candles.slice(Math.max(0, startIndex - len + 1), startIndex + 1);
        return (highest(slice) + lowest(slice)) / 2;
    }

if (!Array.isArray(candles)) return [];
    const conversionLine = new Array(n).fill(null);
    const baseLine = new Array(n).fill(null);
    const leadLine1 = new Array(n + displacement).fill(null);
    const leadLine2 = new Array(n + displacement).fill(null);
    const laggingSpan = new Array(n).fill(null);

    const kumoCloudUpper = new Array(n + displacement).fill(null);
    const kumoCloudLower = new Array(n + displacement).fill(null);

    for (let i = 0; i < n; i++) {

        conversionLine[i] = donchian(i, conversionPeriods);
        baseLine[i] = donchian(i, basePeriods);

        const spanA = (conversionLine[i] + baseLine[i]) / 2;
        const spanB = donchian(i, laggingSpan2Periods);

        // future shift
        const futureIndex = i + displacement;

        if (futureIndex < leadLine1.length) {
            leadLine1[futureIndex] = spanA;
            leadLine2[futureIndex] = spanB;

            // kumo cloud
            kumoCloudUpper[futureIndex] = Math.max(spanA, spanB);
            kumoCloudLower[futureIndex] = Math.min(spanA, spanB);
        }

        // Lagging span
        if (i - displacement >= 0) {
            laggingSpan[i - displacement] = candles[i].close;
        }
    }

    return candles.map((c, i) => ({
        time:c.time,
        conversionLine: conversionLine[i],
        baseLine: baseLine[i],
        leadLine1: leadLine1[i],
        leadLine2: leadLine2[i],
        kumoCloudUpper: kumoCloudUpper[i],
        kumoCloudLower: kumoCloudLower[i],
        laggingSpan: laggingSpan[i]
    }));
}

module.exports = { calculateIchimoku };