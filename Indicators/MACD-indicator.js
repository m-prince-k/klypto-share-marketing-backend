//-------------------------------- MACD Indicator --------------------------------

async function calculateMACD(candles, params) {

    const fastLen = params?.fastLength || 12;
    const slowLen = params?.slowLength || 26;
    const sigLen = params?.signalLength || 9;
    const oscType = params?.oscillatorMAType || "EMA";
    const sigType = params?.signalMAType || "EMA";
    const sourceKey = params?.source || "close";

    // ✅ FIX: Proper source handling (HL2, HLC3, OHLC4)
    function getSource(candle, source) {
        switch (source) {
            case "hl2":
                return (candle.high + candle.low) / 2;

            case "hlc3":
                return (candle.high + candle.low + candle.close) / 3;

            case "ohlc4":
                return (candle.open + candle.high + candle.low + candle.close) / 4;

            case "open":
            case "high":
            case "low":
            case "close":
                return candle[source];

            default:
                return candle.close;
        }
    }
    if (!Array.isArray(candles)) return [];
    
    const src = candles?.map(c => getSource(c, sourceKey));

    // ---------------- SMA ----------------
    function sma(values, period) {
        const result = new Array(values.length).fill(null);

        for (let i = 0; i < values.length; i++) {
            let sum = 0;
            let count = 0;

            for (let j = i; j >= 0 && count < period; j--) {
                if (values[j] !== null) {
                    sum += values[j];
                    count++;
                }
            }

            if (count === period) {
                result[i] = sum / period;
            }
        }

        return result;
    }

    // ---------------- EMA (NULL SAFE) ----------------
    function ema(values, period) {
        const result = new Array(values.length).fill(null);
        const k = 2 / (period + 1);

        let sum = 0;
        let count = 0;

        for (let i = 0; i < values.length; i++) {
            if (values[i] !== null) {
                sum += values[i];
                count++;
            }

            if (count === period) {
                let prev = sum / period;
                result[i] = prev;

                for (let j = i + 1; j < values.length; j++) {
                    if (values[j] === null) {
                        result[j] = null;
                        continue;
                    }

                    const val = values[j] * k + prev * (1 - k);
                    result[j] = val;
                    prev = val;
                }
                break;
            }
        }

        return result;
    }

    // ------------- Generic MA -------------
    function ma(values, period, type) {
        if (type === "SMA") return sma(values, period);
        return ema(values, period);
    }

    // -------- Fast & Slow MA --------
    const fastMA = ma(src, fastLen, oscType);
    const slowMA = ma(src, slowLen, oscType);

    // -------- MACD Line --------
    const macd = src.map((_, i) => {
        if (fastMA[i] === null || slowMA[i] === null) return null;
        return fastMA[i] - slowMA[i];
    });

    // ❌ OLD: null ko 0 bana raha tha (galat)
    // const macdForSignal = macd.map(v => v === null ? 0 : v);

    // ✅ FIX: null safe
    const macdForSignal = macd.map(v => v === null ? null : v);

    // -------- Signal Line --------
    const signal = ma(macdForSignal, sigLen, sigType);

    // -------- Histogram --------
    const hist = macd.map((v, i) => {
        if (v === null || signal[i] === null) return null;
        return v - signal[i];
    });

    // -------- Histogram Colors --------
    const histColor = hist.map((v, i) => {
        if (v === null) return null;

        const prev = i > 0 && hist[i - 1] !== null ? hist[i - 1] : 0;

        if (v >= 0) {
            return v > prev ? "#26a69a" : "#b2dfdb";
        } else {
            return v > prev ? "#ffcdd2" : "#ff5252";
        }
    });

    // -------- Final Output --------
    const result = candles.map((c, i) => ({
        time: c.time,
        macd: macd[i],
        signal: signal[i],
        hist: hist[i],
        histColor: histColor[i]
    }));

    return result;
}

module.exports = { calculateMACD };

