// --------------------------- Negative Volume Index (NVI) ---------------------------

async function calculateNVI(candles,options) {

    //maLength = 255
    const maLength = options?.length ?? options?.maLength ?? 255;

    if (!candles.some(c => c.volume > 0)) {
        throw new Error("No volume is provided by the data vendor.");
    }

    const nviArray = [];
    const emaArray = [];

    let nviPrev = 1000; // Starting value (TradingView/Pine style)
    let emaPrev = 1000;

    const k = 2 / (maLength + 1); // EMA smoothing factor

    for (let i = 0; i < candles.length; i++) {

        const { close, volume } = candles[i];

        if (i === 0) {
            nviArray.push(nviPrev);
            emaArray.push(nviPrev); // Initialize EMA with first NVI value
            continue;
        }

        const prevVolume = candles[i - 1].volume;
        const prevClose = candles[i - 1].close;

        // Update only when volume decreases
        const nviCurr = volume < prevVolume && prevClose !== 0
            ? nviPrev + ((close - prevClose) / prevClose) * nviPrev
            : nviPrev;

        nviArray.push(nviCurr);

        // EMA of NVI
        const emaCurr = emaPrev + k * (nviCurr - emaPrev);
        emaArray.push(emaCurr);

        nviPrev = nviCurr;
        emaPrev = emaCurr;
    }

    // ---- Chart friendly output ----
    return candles.map((c, i) => ({
        time:c.time,
        value: nviArray[i],   // chart-friendly main value
        nvi: nviArray[i],
        nviEma: emaArray[i]
    }));
}

module.exports = { calculateNVI };