// --------------------------- Money Flow Index (MFI) ---------------------------

async function calculateMFI(candles, params) {

    const length = params?.length || 14;

    const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);

    const positiveMoneyFlow = [];
    const negativeMoneyFlow = [];

    const mfiArray = [];

    for (let i = 0; i < candles.length; i++) {

        if (i === 0) {
            positiveMoneyFlow.push(0);
            negativeMoneyFlow.push(0);
            mfiArray.push(null);
            continue;
        }

        const tp = typicalPrices[i];
        const tpPrev = typicalPrices[i - 1];

        const rawMoneyFlow = tp * candles[i].volume;

        if (tp > tpPrev) {
            positiveMoneyFlow.push(rawMoneyFlow);
            negativeMoneyFlow.push(0);
        } else if (tp < tpPrev) {
            positiveMoneyFlow.push(0);
            negativeMoneyFlow.push(rawMoneyFlow);
        } else {
            positiveMoneyFlow.push(0);
            negativeMoneyFlow.push(0);
        }

        if (i < length) {
            mfiArray.push(null);
            continue;
        }

        const posSum = positiveMoneyFlow
            .slice(i - length + 1, i + 1)
            .reduce((a, b) => a + b, 0);

        const negSum = negativeMoneyFlow
            .slice(i - length + 1, i + 1)
            .reduce((a, b) => a + b, 0);

        const moneyFlowRatio = negSum === 0 ? 100 : posSum / negSum;

        const mfi = 100 - (100 / (1 + moneyFlowRatio));

        mfiArray.push(mfi);
    }

    // ---- Return chart-friendly format ----

    return candles.map((c, i) => ({
        time: c.time,
        value: mfiArray[i], // chart friendly
        mfi: mfiArray[i]
    }));
}

module.exports = { calculateMFI };