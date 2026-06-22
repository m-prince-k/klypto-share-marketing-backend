async function calculateKeltnerChannels(candles, params) {

    const length = params?.length || 20;
    const mult = params?.mult || 2;
    const useExpMA = params?.useEMA || "true";
    const bandsStyle = params?.bandsStyle || "Average True Range";
    const atrLength = params?.atrLength || 10;
    const source = params?.source || "close";

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // -------- SMA --------
    function sma(arr, len, i) {
        if (i + 1 < len) return null;
        const sum = arr.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0);
        return sum / len;
    }

    // -------- EMA --------
    function ema(arr, len) {
        const result = [];
        const k = 2 / (len + 1);

        arr.forEach((val, i) => {
            if (i === 0) result.push(val);
            else result.push(val * k + result[i - 1] * (1 - k));
        });

        return result;
    }

    // -------- True Range --------
    function trueRange(i) {
        if (i === 0) return highs[0] - lows[0];

        return Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
    }

    // -------- ATR --------
    function atr(len) {

        const trArr = candles.map((_, i) => trueRange(i));
        const rma = [];

        trArr.forEach((val, i) => {
            if (i === 0) rma.push(val);
            else rma.push((rma[i - 1] * (len - 1) + val) / len);
        });

        return rma;
    }

    // -------- Middle MA --------
    const middleMA = useExpMA
        ? ema(closes, length)
        : closes.map((_, i) => sma(closes, length, i));

    // -------- Range Calculation --------
    let rangeMA;

    if (bandsStyle === "true range") {
        rangeMA = candles.map((_, i) => trueRange(i));

    } else if (bandsStyle === "range") {
        rangeMA = candles.map(c => c.high - c.low);

    } else {
        // default = ATR
        rangeMA = atr(atrLength);
    }

    // -------- Final Output --------
    const result = candles.map((c, i) => ({
        time: c.time,
        keltener: middleMA[i],   // main line
        upper: middleMA[i] !== null
            ? middleMA[i] + rangeMA[i] * mult
            : null,
        middle: middleMA[i],
        lower: middleMA[i] !== null
            ? middleMA[i] - rangeMA[i] * mult
            : null
    }));

    return result;
}

module.exports = { calculateKeltnerChannels };