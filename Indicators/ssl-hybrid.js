/**
 * SSL Hybrid Indicator - Advanced Version
 * Matches TradingView Mihkel00's logic precisely.
 */

// Helper functions
const nz = (val, def = 0) => (val === null || val === undefined || isNaN(val)) ? def : val;
const avg = (...vals) => vals.reduce((a, b) => a + b, 0) / vals.length;

function SMA(src, len) {
    const res = new Array(src.length).fill(null);
    if (src.length < len) return res;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nz(src[i]);
    res[len - 1] = sum / len;
    for (let i = len; i < src.length; i++) {
        sum += nz(src[i]) - nz(src[i - len]);
        res[i] = sum / len;
    }
    return res;
}

function EMA(src, len) {
    const res = new Array(src.length).fill(null);
    if (src.length === 0) return res;
    const alpha = 2 / (len + 1);
    let ema = nz(src[0]);
    res[0] = ema;
    for (let i = 1; i < src.length; i++) {
        ema = nz(src[i]) * alpha + ema * (1 - alpha);
        res[i] = ema;
    }
    return res;
}

function WMA(src, len) {
    const res = new Array(src.length).fill(null);
    if (src.length < len) return res;
    const weightSum = (len * (len + 1)) / 2;
    for (let i = len - 1; i < src.length; i++) {
        let sum = 0;
        for (let j = 0; j < len; j++) {
            sum += nz(src[i - j]) * (len - j);
        }
        res[i] = sum / weightSum;
    }
    return res;
}

function RMA(src, len) {
    const res = new Array(src.length).fill(null);
    if (src.length < len) return res;
    const alpha = 1 / len;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += nz(src[i]);
    let rma = sum / len;
    res[len - 1] = rma;
    for (let i = len; i < src.length; i++) {
        rma = nz(src[i]) * alpha + rma * (1 - alpha);
        res[i] = rma;
    }
    return res;
}

function DEMA(src, len) {
    const e = EMA(src, len);
    const e2 = EMA(e.map(v => nz(v, src[0])), len);
    return e.map((v, i) => (v === null || e2[i] === null) ? null : 2 * v - e2[i]);
}

function TEMA(src, len) {
    const e1 = EMA(src, len);
    const e2 = EMA(e1.map(v => nz(v, src[0])), len);
    const e3 = EMA(e2.map(v => nz(v, src[0])), len);
    return e1.map((v, i) => (v === null || e2[i] === null || e3[i] === null) ? null : 3 * (v - e2[i]) + e3[i]);
}

function LSMA(src, len, offset = 0) {
    const res = new Array(src.length).fill(null);
    if (src.length < len) return res;
    for (let i = len - 1; i < src.length; i++) {
        let sumX = 0;
        let sumY = 0;
        let sumXSq = 0;
        let sumXY = 0;
        for (let j = 0; j < len; j++) {
            const val = src[i - j];
            const x = len - 1 - j;
            sumX += x;
            sumY += val;
            sumXSq += x * x;
            sumXY += x * val;
        }
        const slope = (len * sumXY - sumX * sumY) / (len * sumXSq - sumX * sumX);
        const intercept = (sumY - slope * sumX) / len;
        res[i] = slope * (len - 1 + offset) + intercept;
    }
    return res;
}

function HMA(src, len) {
    const halfLen = Math.floor(len / 2);
    const sqrtLen = Math.round(Math.sqrt(len));
    const wmaHalf = WMA(src, halfLen);
    const wmaFull = WMA(src, len);
    const diff = wmaHalf.map((v, i) => (v === null || wmaFull[i] === null) ? null : 2 * v - wmaFull[i]);
    return WMA(diff.map(v => nz(v)), sqrtLen);
}

function TMA(src, len) {
    const len1 = Math.ceil(len / 2);
    const len2 = Math.floor(len / 2) + 1;
    const sma1 = SMA(src, len1);
    return SMA(sma1.map(v => nz(v)), len2);
}

function JMA(src, len, phase = 0, power = 2) {
    const res = new Array(src.length).fill(null);
    if (src.length === 0) return res;
    const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
    const beta = 0.45 * (len - 1) / (0.45 * (len - 1) + 2);
    const alpha = Math.pow(beta, power);
    let e0 = 0, e1 = 0, e2 = 0, jma = 0;
    for (let i = 0; i < src.length; i++) {
        const val = nz(src[i]);
        e0 = (1 - alpha) * val + alpha * e0;
        e1 = (val - e0) * (1 - beta) + beta * e1;
        e2 = (e0 + phaseRatio * e1 - jma) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * e2;
        jma = e2 + jma;
        res[i] = jma;
    }
    return res;
}

function McGinley(src, len) {
    const res = new Array(src.length).fill(null);
    if (src.length === 0) return res;
    const emaBase = EMA(src, len);
    let mg = emaBase[0];
    for (let i = 0; i < src.length; i++) {
        if (i === 0) {
            mg = emaBase[i];
        } else {
            mg = mg + (nz(src[i]) - mg) / (len * Math.pow(nz(src[i]) / mg, 4));
        }
        res[i] = mg;
    }
    return res;
}

function VAMA(src, len, volLookback = 10) {
    const mid = EMA(src, len);
    const res = new Array(src.length).fill(null);
    for (let i = 0; i < src.length; i++) {
        if (i < Math.max(len, volLookback)) {
            res[i] = mid[i];
            continue;
        }
        const dev = [];
        for (let j = 0; j < volLookback; j++) {
            dev.push(src[i - j] - (mid[i - j] || mid[i]));
        }
        const volUp = Math.max(...dev);
        const volDown = Math.min(...dev);
        res[i] = mid[i] + (volUp + volDown) / 2;
    }
    return res;
}

function MF(src, len, feedback = false, z = 0.5, beta = 0.8) {
    const res = new Array(src.length).fill(null);
    const alpha = 2 / (len + 1);
    let ts = src[0], b = src[0], c = src[0], os = 0;
    for (let i = 0; i < src.length; i++) {
        const prevTs = i > 0 ? res[i - 1] : src[0];
        const a = feedback ? z * src[i] + (1 - z) * prevTs : src[i];
        b = a > alpha * a + (1 - alpha) * b ? a : alpha * a + (1 - alpha) * b;
        c = a < alpha * a + (1 - alpha) * c ? a : alpha * a + (1 - alpha) * c;
        os = a === b ? 1 : (a === c ? 0 : os);
        const upper = beta * b + (1 - beta) * c;
        const lower = beta * c + (1 - beta) * b;
        ts = os * upper + (1 - os) * lower;
        res[i] = ts;
    }
    return res;
}

function get2PoleSSF(src, length) {
    const res = new Array(src.length).fill(0);
    const PI = Math.PI;
    const arg = Math.sqrt(2) * PI / length;
    const a1 = Math.exp(-arg);
    const b1 = 2 * a1 * Math.cos(arg);
    const c2 = b1;
    const c3 = -Math.pow(a1, 2);
    const c1 = 1 - c2 - c3;
    for (let i = 0; i < src.length; i++) {
        res[i] = c1 * src[i] + c2 * nz(res[i - 1]) + c3 * nz(res[i - 2]);
    }
    return res;
}

function get3PoleSSF(src, length) {
    const res = new Array(src.length).fill(0);
    const PI = Math.PI;
    const arg = PI / length;
    const a1 = Math.exp(-arg);
    const b1 = 2 * a1 * Math.cos(1.738 * arg);
    const c1 = Math.pow(a1, 2);
    const coef2 = b1 + c1;
    const coef3 = -(c1 + b1 * c1);
    const coef4 = Math.pow(c1, 2);
    const coef1 = 1 - coef2 - coef3 - coef4;
    for (let i = 0; i < src.length; i++) {
        res[i] = coef1 * src[i] + coef2 * nz(res[i - 1]) + coef3 * nz(res[i - 2]) + coef4 * nz(res[i - 3]);
    }
    return res;
}

function EDSMA(src, len, ssfLength = 20, ssfPoles = 2) {
    const zeros = src.map((v, i) => v - nz(src[i - 2], v));
    const avgZeros = zeros.map((v, i) => (v + nz(zeros[i - 1], v)) / 2);
    const ssf = ssfPoles === 2 ? get2PoleSSF(avgZeros, ssfLength) : get3PoleSSF(avgZeros, ssfLength);
    const res = new Array(src.length).fill(null);
    let edsma = src[0];
    for (let i = 0; i < src.length; i++) {
        const lookback = ssf.slice(Math.max(0, i - len + 1), i + 1);
        if (lookback.length < 2) {
            res[i] = src[i];
            continue;
        }
        const mean = avg(...lookback);
        const stdev = Math.sqrt(avg(...lookback.map(v => Math.pow(v - mean, 2))));
        const scaledFilter = stdev !== 0 ? ssf[i] / stdev : 0;
        const alpha = Math.min(1, Math.max(0, 5 * Math.abs(scaledFilter) / len));
        edsma = alpha * src[i] + (1 - alpha) * edsma;
        res[i] = edsma;
    }
    return res;
}

function KijunV2(src, len, kidiv = 1) {
    const res = new Array(src.length).fill(null);
    for (let i = 0; i < src.length; i++) {
        const start = Math.max(0, i - len + 1);
        const lookbackLow = src.slice(start, i + 1);
        const lowest = Math.min(...lookbackLow);
        const highest = Math.max(...lookbackLow);
        const kijun = (lowest + highest) / 2;
        const convLen = Math.floor(len / kidiv);
        const startConv = Math.max(0, i - Math.max(1, convLen) + 1);
        const lookbackConv = src.slice(startConv, i + 1);
        const lowestConv = Math.min(...lookbackConv);
        const highestConv = Math.max(...lookbackConv);
        const conversionLine = (lowestConv + highestConv) / 2;
        res[i] = (kijun + conversionLine) / 2;
    }
    return res;
}

function ma(type, src, len, options = {}) {
    if (!src || src.length === 0) return [];
    switch (type) {
        case "SMA": return SMA(src, len);
        case "EMA": return EMA(src, len);
        case "WMA": return WMA(src, len);
        case "DEMA": return DEMA(src, len);
        case "TEMA": return TEMA(src, len);
        case "LSMA": return LSMA(src, len);
        case "HMA": return HMA(src, len);
        case "TMA": return TMA(src, len);
        case "JMA": return JMA(src, len, options.phase || 3, options.power || 1);
        case "McGinley": return McGinley(src, len);
        case "VAMA": return VAMA(src, len, options.volatilityLookback || 10);
        case "MF": return MF(src, len, options.feedback || false, options.feedbackWeighting || 0.5, options.beta || 0.8);
        case "EDSMA": return EDSMA(src, len, options.superSmootherLength || 20, options.superSmootherPoles || 2);
        case "Kijun v2": return KijunV2(src, len, options.kijunDivider || 1);
        default: return SMA(src, len);
    }
}

function calculateATR(highs, lows, closes, length, smoothing = "WMA") {
    const tr = new Array(highs.length).fill(0);
    for (let i = 1; i < highs.length; i++) {
        tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
    tr[0] = highs[0] - lows[0];
    switch (smoothing) {
        case "RMA": return RMA(tr, length);
        case "SMA": return SMA(tr, length);
        case "EMA": return EMA(tr, length);
        case "WMA": return WMA(tr, length);
        default: return WMA(tr, length);
    }
}

function percentrank(src, len) {
    const res = new Array(src.length).fill(0);
    for (let i = 0; i < src.length; i++) {
        const lookback = src.slice(Math.max(0, i - len + 1), i + 1);
        const current = src[i];
        let count = 0;
        for (let v of lookback) {
            if (v <= current) count++;
        }
        res[i] = (count / lookback.length) * 100;
    }
    return res;
}

async function calculateSSLHybrid(candles, options = {}) {
    if (!candles || candles.length === 0) return [];

    const maType = options.maType || "HMA";
    const baseLen = options.baseLen || 60;
    const srcInput = options.src || "close";
    const multy = options.multy || 0.2;
    const useTrueRange = options.useTrueRange !== undefined ? options.useTrueRange : true;

    const ssl2Type = options.ssl2Type || "JMA";
    const ssl2Len = options.ssl2Len || 5;
    const atrCrit = options.atrCrit || 0.9;

    const ssl3Type = options.ssl3Type || "HMA";
    const ssl3Len = options.ssl3Len || 15;

    const atrLen = options.atrLen || 14;
    const atrMult = options.atrMult || 1.0;
    const atrSmoothing = options.atrSmoothing || "WMA";

    const riskLookback = options.riskLookback || 100;
    const riskSensitivity = options.riskSensitivity || 2.0;
    const enableRiskGradient = options.enableRiskGradient !== undefined ? options.enableRiskGradient : true;
    const showAtrBands = options.showAtrBands !== undefined ? options.showAtrBands : true;

    // Advanced MA Options
    const maOptions = {
        phase: options.phase || 3,
        power: options.power || 1,
        kijunDivider: options.kijunDivider || 1,
        volatilityLookback: options.volatilityLookback || 10,
        beta: options.beta || 0.8,
        feedback: options.feedback || false,
        feedbackWeighting: options.feedbackWeighting || 0.5,
        superSmootherLength: options.superSmootherLength || 20,
        superSmootherPoles: options.superSmootherPoles || 2
    };

    const highs = candles.map(c => Number(c.high));
    const lows = candles.map(c => Number(c.low));
    const closes = candles.map(c => Number(c.close));
    const opens = candles.map(c => Number(c.open));
    const srcArr = candles.map(c => Number(c[srcInput] || c.close));

    // ATR Calculation
    const atrSlen = calculateATR(highs, lows, closes, atrLen, atrSmoothing);

    // Risk Calculation
    const atrPercentile = percentrank(atrSlen, riskLookback);

    // Baseline Calculations
    const BBMC = ma(maType, closes, baseLen, maOptions);
    const Keltma = ma(maType, srcArr, baseLen, maOptions);
    const rangeValue = useTrueRange ?
        new Array(highs.length).fill(0).map((_, i) => i === 0 ? highs[i] - lows[i] : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))) :
        highs.map((h, i) => h - lows[i]);
    const rangema = EMA(rangeValue, baseLen);
    const upperk = Keltma.map((v, i) => v + (rangema[i] || 0) * multy);
    const lowerk = Keltma.map((v, i) => v - (rangema[i] || 0) * multy);

    // SSL Calculations
    const emaHigh = ma(maType, highs, baseLen, maOptions);
    const emaLow = ma(maType, lows, baseLen, maOptions);

    // SSL2
    const maHigh2 = ma(ssl2Type, highs, ssl2Len, maOptions);
    const maLow2 = ma(ssl2Type, lows, ssl2Len, maOptions);

    // Exit
    const exitHigh = ma(ssl3Type, highs, ssl3Len, maOptions);
    const exitLow = ma(ssl3Type, lows, ssl3Len, maOptions);

    let hlv = 0, hlv2 = 0, hlv3 = 0;
    const sslDown = new Array(candles.length).fill(null);
    const sslDown2 = new Array(candles.length).fill(null);
    const sslExit = new Array(candles.length).fill(null);

    return candles.map((c, i) => {
        // SSL1 Logic
        if (closes[i] > emaHigh[i]) hlv = 1;
        else if (closes[i] < emaLow[i]) hlv = -1;
        sslDown[i] = hlv < 0 ? emaHigh[i] : emaLow[i];

        // SSL2 Logic
        if (closes[i] > maHigh2[i]) hlv2 = 1;
        else if (closes[i] < maLow2[i]) hlv2 = -1;
        sslDown2[i] = hlv2 < 0 ? maHigh2[i] : maLow2[i];

        // Exit Logic
        if (closes[i] > exitHigh[i]) hlv3 = 1;
        else if (closes[i] < exitLow[i]) hlv3 = -1;
        sslExit[i] = hlv3 < 0 ? exitHigh[i] : exitLow[i];

        // Signals
        const baseCrossLong = (i > 0 && closes[i] > sslExit[i] && closes[i - 1] <= sslExit[i - 1]);
        const baseCrossShort = (i > 0 && closes[i] < sslExit[i] && closes[i - 1] >= sslExit[i - 1]);

        const diff = Math.abs(closes[i] - opens[i]);
        const atrViolation = diff > (atrSlen[i] || 0);
        const inRange = (closes[i] + (atrSlen[i] || 0) * atrMult > BBMC[i]) && (closes[i] - (atrSlen[i] || 0) * atrMult < BBMC[i]);
        const candlesizeViolation = atrViolation && inRange;

        // SSL2 Continuation
        const upperHalf = (atrSlen[i] || 0) * atrCrit + closes[i];
        const lowerHalf = closes[i] - (atrSlen[i] || 0) * atrCrit;
        const buyInAtr = lowerHalf < sslDown2[i];
        const sellInAtr = upperHalf > sslDown2[i];
        const sellCont = closes[i] < BBMC[i] && closes[i] < sslDown2[i];
        const buyCont = closes[i] > BBMC[i] && closes[i] > sslDown2[i];
        const buySignal = buyInAtr && buyCont;
        const sellSignal = sellInAtr && sellCont;

        const distance = (atrSlen[i] && atrSlen[i] !== 0) ? Math.abs(closes[i] - BBMC[i]) / atrSlen[i] : 0;
        const entryDistance = distance < 1 ? "Near" : (distance < 2 ? "Extended" : "Far");

        // Risk Gradient Integration
        let riskLevel = "Normal";
        let adjustedPercentile = nz(atrPercentile[i]);
        if (enableRiskGradient) {
            const highThreshold = 100 - (30 / riskSensitivity);
            const lowThreshold = 20 / riskSensitivity;
            riskLevel = adjustedPercentile > highThreshold ? "High" : (adjustedPercentile < lowThreshold ? "Low" : "Normal");
        }

        return {
            time: c.time,
            timestamp: c.timestamp,
            baseline: Number(nz(BBMC[i]).toFixed(2)),
            upperChannel: Number(nz(upperk[i]).toFixed(2)),
            lowerChannel: Number(nz(lowerk[i]).toFixed(2)),
            ssl1: Number(nz(sslDown[i]).toFixed(2)),
            ssl2: Number(nz(sslDown2[i]).toFixed(2)),
            sslExit: Number(nz(sslExit[i]).toFixed(2)),
            // ATR Bands Toggle
            atrUpper: showAtrBands ? Number((closes[i] + (atrSlen[i] || 0) * atrMult).toFixed(2)) : null,
            atrLower: showAtrBands ? Number((closes[i] - (atrSlen[i] || 0) * atrMult).toFixed(2)) : null,
            buySignal,
            sellSignal,
            baseCrossLong,
            baseCrossShort,
            candlesizeViolation,
            riskLevel,
            entryDistance,
            atrPercentile: enableRiskGradient ? Number(adjustedPercentile.toFixed(1)) : null,
            atr: Number(nz(atrSlen[i]).toFixed(4))
        };
    });
}

module.exports = { calculateSSLHybrid };
