// -------------------------------------- Klinger Oscillator ----------------------------

async function calculateKlingerOscillator(candles, options) {
    const fastLen = options?.fastLength || options?.shortLength || options?.shortEma || options?.shortEMA || 34;
    const slowLen = options?.slowLength || options?.longLength || options?.longEma || options?.longEMA || 55;
    const signalLen = options?.signalLength || options?.signalEma || options?.signalEMA || 13;

    const n = candles.length;

    // hlc3 = (high + low + close) / 3
    const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3);

    // Signed Volume
    const sv = [];
    for (let i = 0; i < n; i++) {
        const prevHlc3 = i === 0 ? hlc3[0] : hlc3[i - 1];
        sv.push(hlc3[i] - prevHlc3 >= 0 ? candles[i].volume : -candles[i].volume);
    }

    // EMA helper
    function ema(values, length) {
        const result = [];
        const alpha = 2 / (length + 1);

        for (let i = 0; i < values.length; i++) {
            if (i === 0) {
                result.push(values[0]);
            } else {
                result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
            }
        }

        return result;
    }

    // EMAs
    const emaFast = ema(sv, fastLen);
    const emaSlow = ema(sv, slowLen);

    // KVO
    const kvo = emaFast.map((v, i) => v - emaSlow[i]);

    // Signal line
    const signal = ema(kvo, signalLen);

    // Combine results with time
    const result = kvo.map((v, i) => ({
        time: candles[i].time, // added time
        ko: v,                 // chart-friendly value
        kvo: v,
        klinger: v,
        signal: signal[i],
        klingerSignal: signal[i]
    }));

    return result;
}

module.exports = { calculateKlingerOscillator };