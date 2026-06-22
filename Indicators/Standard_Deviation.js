// ------------------------- Standard Deviation --------------------------------------

async function calculateStdev(candles, options) {

    const length = options?.length || 20;
    const source = options?.source || "close";

    const n = candles?.length;

    // Source series
    const src = candles.map(c => {
        switch (source) {
            case "hlc3":
                return (c.high + c.low + c.close) / 3;
            case "close":
            default:
                return c.close;
        }
    });

    const result = [];

    for (let i = 0; i < n; i++) {

        let value = null;

        if (i >= length - 1) {

            const slice = src.slice(i - length + 1, i + 1);

            const mean =
                slice.reduce((acc, val) => acc + val, 0) / length;

            const variance =
                slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / length;

            value = Math.sqrt(variance);
        }

        result.push({
            time: candles[i].time,
            value: value
        });
    }

    return result;
}

module.exports = { calculateStdev };