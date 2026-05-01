async function calculatePVI(candles, options = {}) {
    const maLength = options?.length ?? options?.maLength ?? 255;

    if (!candles || candles.length === 0) {
        throw new Error("Candles data is empty.");
    }

    if (!candles.some(c => c.volume > 0)) {
        throw new Error("No volume is provided by the data vendor.");
    }

    const pviArray = [];
    const emaArray = [];

    let pviPrev = 1000;
    let emaPrev = 1000;

    const k = 2 / (maLength + 1);

    for (let i = 0; i < candles.length; i++) {
        const { close, volume } = candles[i];

        if (i === 0) {
            pviArray.push(pviPrev);
            emaArray.push(pviPrev); // Initialize EMA with first PVI value
            continue;
        }

        const prev = candles[i - 1];

        let pviCurr = pviPrev;

        // ✅ safer condition
        if (volume > prev.volume && prev.close !== 0) {
            const change = (close - prev.close) / prev.close;
            pviCurr = pviPrev * (1 + change);
        }

        pviArray.push(pviCurr);

        // ✅ EMA calculation
        const emaCurr = emaPrev + k * (pviCurr - emaPrev);
        emaArray.push(emaCurr);

        pviPrev = pviCurr;
        emaPrev = emaCurr;
    }

    return candles.map((c, i) => ({
        time: c.time,
        value: pviArray[i],
        pvi: pviArray[i],
        pviEma: emaArray[i]
    }));
}

module.exports = { calculatePVI };