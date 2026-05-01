async function calculateAD(candles, options = {}) {
    let length = null;
    let maType = "None";

    if (options !== null && typeof options === "object") {
        const parsedLength = Number(options.length ?? options.value ?? null);
        length = Number.isFinite(parsedLength) ? parsedLength : null;
        maType = options.maType != null ? String(options.maType) : "None";
    } else if (typeof options === "number") {
        length = options;
        maType = "SMA";
    }

    const normalizedMaType = maType.trim().toUpperCase();

    const adValues = [];
    // Start from 0 so relative movement matches TradingView (TV also starts cumulative from 0 at its first bar)
    let cumAD = 0;

    if (!Array.isArray(candles)) return [];
    
    // ---------------- STEP 1: RAW AD ----------------
    candles.forEach(candle => {
        const { high, low, close, volume } = candle;

        let ad = 0;
        if (!(close === high && close === low) && high !== low) {
            ad = ((2 * close - low - high) / (high - low)) * volume;
        }

        cumAD += ad;
        adValues.push(cumAD);
    });

    // ---------------- STEP 2: SMOOTHING ----------------
    let smoothedAD = adValues;

    if (length && length > 1 && normalizedMaType !== "NONE") {
        const result = new Array(adValues.length).fill(null);

        switch (normalizedMaType) {

            // ✅ SMA (already mostly correct)
            case "SMA":
                for (let i = length - 1; i < adValues.length; i++) {
                    let sum = 0;
                    for (let j = 0; j < length; j++) {
                        sum += adValues[i - j];
                    }
                    result[i] = sum / length;
                }
                break;

            // ✅ EMA (FIXED - proper seed)
            case "EMA": {
                const k = 2 / (length + 1);

                // seed = SMA of first length
                let sum = 0;
                for (let i = 0; i < length; i++) {
                    sum += adValues[i];
                }
                result[length - 1] = sum / length;

                for (let i = length; i < adValues.length; i++) {
                    result[i] =
                        adValues[i] * k +
                        result[i - 1] * (1 - k);
                }
                break;
            }

            // ✅ RMA / SMMA (TradingView style)
            case "RMA":
            case "SMMA (RMA)": {
                let sum = 0;

                // seed = SMA
                for (let i = 0; i < length; i++) {
                    sum += adValues[i];
                }
                result[length - 1] = sum / length;

                for (let i = length; i < adValues.length; i++) {
                    result[i] =
                        (result[i - 1] * (length - 1) + adValues[i]) / length;
                }
                break;
            }

            // ✅ WMA (clean + strict)
            case "WMA":
                for (let i = length - 1; i < adValues.length; i++) {
                    let weightedSum = 0;
                    let weightTotal = 0;

                    for (let j = 0; j < length; j++) {
                        const weight = j + 1;
                        weightedSum += adValues[i - length + 1 + j] * weight;
                        weightTotal += weight;
                    }

                    result[i] = weightedSum / weightTotal;
                }
                break;

            default:
                break;
        }

        smoothedAD = result;
    }

    // ---------------- STEP 3: OUTPUT ----------------
    return candles.map((candle, i) => ({
        time: candle.time,
        datetime: candle.datetime,
        value: smoothedAD[i] ?? null,
        ad: smoothedAD[i] ?? null,
        AD: smoothedAD[i] ?? null
    }));
}

module.exports = { calculateAD };