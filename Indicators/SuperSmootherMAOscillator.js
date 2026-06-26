/**
 * SuperSmoother MA Oscillator
 * JavaScript Version (Equivalent of Pine Script v6)
 * © BOSWaves - Enhanced Edition
 */

function superSmootherMAOscillator(candles, options = {}) {
    const smoothingLength = options.smoothingLength || 5;
    const fastLength = options.fastLength || 20;
    const slowLength = options.slowLength || 50;
    const atrLength = options.atrLength || 20;
    const atrMultiplier = options.atrMultiplier || 1.2;
    const signalSensitivity = options.signalSensitivity || 0.03;
    const enableCandleColor = options.enableCandleColor !== undefined ? options.enableCandleColor : true;
    const enhancedColors = options.enhancedColors !== undefined ? options.enhancedColors : true;
    const sourceData = (options.sourceData || 'close').toLowerCase();

    // Helper functions
    const emaArray = (data, length) => {
        const alpha = 2 / (length + 1);
        let ema = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                ema.push(data[i]);
            } else {
                ema.push((data[i] - ema[i - 1]) * alpha + ema[i - 1]);
            }
        }
        return ema;
    };

    const atrArray = (data, length) => {
        let tr = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                tr.push(data[i].high - data[i].low);
            } else {
                let highLow = data[i].high - data[i].low;
                let highClose = Math.abs(data[i].high - data[i - 1].close);
                let lowClose = Math.abs(data[i].low - data[i - 1].close);
                tr.push(Math.max(highLow, highClose, lowClose));
            }
        }
        
        const alpha = 1 / length;
        let atr = [];
        let sum = 0;
        for (let i = 0; i < tr.length; i++) {
            if (i < length) {
                sum += tr[i];
                if (i === length - 1) {
                    atr.push(sum / length);
                } else {
                    atr.push(0);
                }
            } else {
                let currentAtr = (tr[i] - atr[i - 1]) * alpha + atr[i - 1];
                atr.push(currentAtr);
            }
        }
        return atr;
    };

    const hsv_to_rgb = (h, s, v) => {
        let c = v * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = v - c;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        return {
            r: Math.floor((r + m) * 255),
            g: Math.floor((g + m) * 255),
            b: Math.floor((b + m) * 255)
        };
    };

    const rgbToHex = (r, g, b) => {
        return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
    };

    // Calculate SuperSmoother
    let a1 = Math.exp(-1.414 * Math.PI / smoothingLength);
    let b1 = 2.0 * a1 * Math.cos(1.414 * Math.PI / smoothingLength);
    let c2 = b1;
    let c3 = -a1 * a1;
    let c1 = 1 - c2 - c3;

    let ss = new Array(candles.length).fill(0);
    
    const getSource = (c) => {
        if (!c) return 0;
        let o = parseFloat(c.open);
        let h = parseFloat(c.high);
        let l = parseFloat(c.low);
        let cl = parseFloat(c.close);
        switch(sourceData) {
            case 'open': return o;
            case 'high': return h;
            case 'low': return l;
            case 'hl2': return (h + l) / 2;
            case 'hlc3': return (h + l + cl) / 3;
            case 'ohlc4': return (o + h + l + cl) / 4;
            case 'close':
            default: return cl;
        }
    };

    for (let i = 0; i < candles.length; i++) {
        let src = getSource(candles[i]);
        let src_prev = i > 0 ? getSource(candles[i - 1]) : 0; 
        
        let ss_1 = i > 0 ? ss[i - 1] : 0;
        let ss_2 = i > 1 ? ss[i - 2] : 0;

        ss[i] = c1 * (src + src_prev) / 2 + c2 * ss_1 + c3 * ss_2;
    }

    let fastMA = emaArray(ss, fastLength);
    let slowMA = emaArray(ss, slowLength);
    let atrVals = atrArray(candles, 20); // Normalized using atr(20) as per PineScript
    let atrValsSignal = atrArray(candles, atrLength); // Signal using atrLength

    let oscillator = new Array(candles.length).fill(0);
    let oscillatorNormalized = new Array(candles.length).fill(0);
    let accel_raw = new Array(candles.length).fill(0);

    for (let i = 0; i < candles.length; i++) {
        oscillator[i] = fastMA[i] - slowMA[i];
        if (atrVals[i] !== 0) {
            oscillatorNormalized[i] = (oscillator[i] / atrVals[i]) * 100;
        }
        accel_raw[i] = oscillator[i] - (i > 0 ? oscillator[i - 1] : oscillator[i]);
    }

    let accel_smooth = emaArray(accel_raw, 3);
    let signalLine = emaArray(oscillator, 25);

    const tanh = (x) => {
        let ex = Math.exp(2 * x);
        return (ex - 1) / (ex + 1);
    };

    let hue_raw = new Array(candles.length).fill(0);
    let hue = new Array(candles.length).fill(0);

    for (let i = 0; i < candles.length; i++) {
        let currentAtr20 = atrVals[i] || 0;
        let denom = currentAtr20 * 0.01;
        let accel_norm = 0;
        if (denom !== 0) {
            let x = accel_smooth[i] / denom;
            accel_norm = tanh(x);
        }
        hue_raw[i] = 60 + accel_norm * 60;
        hue[i] = i > 0 ? (hue_raw[i] + hue_raw[i - 1]) / 2 : hue_raw[i];
    }

    let results = [];

    for (let i = 0; i < candles.length; i++) {
        let currAtrSignal = atrValsSignal[i] || 0;
        let minSignalThreshold = currAtrSignal * signalSensitivity;

        let prevOsc = i > 0 ? oscillator[i - 1] : oscillator[i];
        let currOsc = oscillator[i];
        let prevSig = i > 0 ? signalLine[i - 1] : signalLine[i];
        let currSig = signalLine[i];

        let bullishSignal = false;
        let bearishSignal = false;

        let crossover = (prevOsc <= prevSig) && (currOsc > currSig);
        let crossunder = (prevOsc >= prevSig) && (currOsc < currSig);

        if (crossover) {
            bullishSignal = true;
        }
        if (crossunder) {
            bearishSignal = true;
        }

        let oscillatorMomentum = currOsc - prevOsc;
        let signalMomentum = currSig - prevSig;

        let strongBullishSignal = bullishSignal && oscillatorMomentum > 0;
        let strongBearishSignal = bearishSignal && oscillatorMomentum < 0;

        // Visual Colors
        let oscillatorColor = "#FFFF00"; // color.yellow
        if (enhancedColors) {
            let hsv = hsv_to_rgb(hue[i], 1.0, 1.0);
            oscillatorColor = rgbToHex(hsv.r, hsv.g, hsv.b);
        }

        let histogramColor = currOsc > currSig ? (enhancedColors ? "#00FF7F" : "#008000") : (enhancedColors ? "#FF1493" : "#FF0000");
        let signalColor = enhancedColors ? "#FF6B35" : "#FFA500"; // color.orange

        let candleColor = null;
        if (enableCandleColor) {
            if (currOsc > currSig) {
                candleColor = "green";
            } else if (currOsc < currSig) {
                candleColor = "red";
            } else {
                candleColor = "gray";
            }
        }

        results.push({
            time: candles[i].time || candles[i].timestamp || candles[i].datetime,
            open: candles[i].open,
            high: candles[i].high,
            low: candles[i].low,
            close: candles[i].close,
            volume: candles[i].volume,

            smoothedPrice: ss[i],
            fastMA: fastMA[i],
            slowMA: slowMA[i],
            oscillator: currOsc,
            oscillatorNormalized: oscillatorNormalized[i],
            signalLine: currSig,
            histogram: currOsc - currSig,
            atr: currAtrSignal,
            
            bullishSignal,
            bearishSignal,
            strongBullishSignal,
            strongBearishSignal,
            
            oscillatorMomentum,
            signalMomentum,

            // Visuals
            oscillatorColor,
            histogramColor,
            signalColor,
            candleColor
        });
    }

    return results;
}

module.exports = {
    superSmootherMAOscillator
};
