/**
 * Kaufman's Adaptive Moving Average (KAMA) - TradingView Matching
 * with multi-source support
 */

function calculateKAMA(candles, options = {}) {

    const erLength = options?.ERLength || 10;
    const fastLength = options?.fastLength || 2;
    const slowLength = options?.slowLength || 30;
    const source = options?.source || "close";

    // ✅ SOURCE HANDLER
    const getSource = (c) => {
        switch (source) {
            case "hl2":
                return (c.high + c.low) / 2;

            case "hlc3":
                return (c.high + c.low + c.close) / 3;

            case "ohlc4":
                return (c.open + c.high + c.low + c.close) / 4;

            case "open":
                return c.open;

            case "high":
                return c.high;

            case "low":
                return c.low;

            case "close":
            default:
                return c.close;
        }
    };

    const src = candles.map(getSource);
    const kama = new Array(src.length).fill(null);

    const fastSC = 2 / (fastLength + 1);
    const slowSC = 2 / (slowLength + 1);

    // ✅ STEP 1: First KAMA = SMA
    const sma = (data, length, endIndex) => {
        let sum = 0;
        for (let i = endIndex - length + 1; i <= endIndex; i++) {
            sum += data[i];
        }
        return sum / length;
    };

    if (src.length >= erLength) {
        kama[erLength - 1] = sma(src, erLength, erLength - 1);
    }

    // ✅ STEP 2: Main loop
    for (let i = erLength; i < src.length; i++) {

        let change = Math.abs(src[i] - src[i - erLength]);

        let volatility = 0;
        for (let j = i - erLength + 1; j <= i; j++) {
            volatility += Math.abs(src[j] - src[j - 1]);
        }

        let er = volatility === 0 ? 0 : change / volatility;

        let sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);

        let prevKAMA = kama[i - 1];
        let currentKAMA = prevKAMA + sc * (src[i] - prevKAMA);

        kama[i] = currentKAMA;
    }

    return candles.map((candle, i) => ({
        time:candle?.time,
        kama: kama[i]
    }));
}

module.exports = { calculateKAMA };