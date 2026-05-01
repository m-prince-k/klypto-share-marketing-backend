
function calculateEMA(src, length = 9) {

    const ema = [];
    const k = 2 / (length + 1);

    for (let i = 0; i < src.length; i++) {

        if (i === 0) {
            ema.push(src[i]);
        } else {
            ema.push(src[i] * k + ema[i - 1] * (1 - k));
        }
    }

    return ema;
}


async function calculateTEMA(candles, options) {
//length = 9, srcKey = "close"
    const length = options?.length ||14;
    const srcKey= options?.source ||"close";
    
    const src = candles.map(c => c[srcKey]);
    const ema1 = calculateEMA(src, length);
    const ema2 = calculateEMA(ema1, length);
    const ema3 = calculateEMA(ema2, length);

    const tema = src.map((_, i) => 3 * (ema1[i] - ema2[i]) + ema3[i]);

    return candles.map((candle, index) => ({
        time: candle.time,
        datetime: candle.datetime,
        tema: tema[index] ?? null
    }));

}


module.exports = { calculateTEMA }
