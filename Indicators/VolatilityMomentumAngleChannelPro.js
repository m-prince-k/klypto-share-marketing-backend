/**
 * 9:15 Volatility Momentum Angle Channel Pro
 * JavaScript Equivalent of Pine Script v6
 */
function volatilityMomentumAngleChannelPro(candles, options = {}) {
    const sessionStartHour = options.sessionStartHour !== undefined ? options.sessionStartHour : 9;
    const sessionStartMin = options.sessionStartMin !== undefined ? options.sessionStartMin : 15;
    const atrLen = options.atrLen || 14;
    const volLen = options.volLen || 20;
    const angleLen = options.angleLen || 5;
    const orBars = options.orBars || 3;
    const channelMult = options.channelMult || 1.5;
    const sharpAngle = options.sharpAngle || 65;
    const extremeAngle = options.extremeAngle || 80;

    let results = [];
    
    // Arrays for simple calculations
    let trArray = [];
    let atrArray = [];
    let volArray = [];
    let volAvgArray = [];
    
    let orHigh = null;
    let orLow = null;
    let barCounter = 0;
    let lastDate = null;

    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        let open = c.open;
        let high = c.high;
        let low = c.low;
        let close = c.close;
        let volume = c.volume || 0;
        
        // Time logic (Assuming IST +5:30)
        let date = c.datetime ? new Date(c.datetime) : (c.timestamp ? new Date(c.timestamp) : (c.time ? new Date(c.time < 1e12 ? c.time * 1000 : c.time) : new Date()));
        const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
        let h = istDate.getUTCHours();
        let m = istDate.getUTCMinutes();
        let d = istDate.getUTCDate();
        
        // New Day Check
        let newDay = (lastDate !== d);
        if (newDay) {
            orHigh = null;
            orLow = null;
            barCounter = 0;
            lastDate = d;
        }

        // Opening Range logic
        if (h === sessionStartHour && m >= sessionStartMin && barCounter < orBars) {
            orHigh = orHigh === null ? high : Math.max(orHigh, high);
            orLow = orLow === null ? low : Math.min(orLow, low);
            barCounter += 1;
        }
        
        let is915 = (h === sessionStartHour && m === sessionStartMin);

        // TR & ATR (RMA based usually in PineScript, but let's use RMA like PineScript's `ta.atr`)
        let prevClose = i > 0 ? candles[i - 1].close : close;
        let tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trArray.push(tr);
        
        let atr = null;
        if (i === atrLen - 1) {
            let sum = 0;
            for(let j = 0; j <= i; j++) sum += trArray[j];
            atr = sum / atrLen;
        } else if (i >= atrLen) {
            atr = (atrArray[i - 1] * (atrLen - 1) + tr) / atrLen;
        }
        atrArray.push(atr);

        // Vol Average (SMA)
        volArray.push(volume);
        let volAvg = null;
        if (i >= volLen - 1) {
            let sum = 0;
            for(let j = i - volLen + 1; j <= i; j++) sum += volArray[j];
            volAvg = sum / volLen;
        }
        volAvgArray.push(volAvg);

        // Core data
        let body = Math.abs(close - open);
        let rangeCandle = high - low;
        
        let bodyPower = rangeCandle > 0 ? body / rangeCandle : 0;
        let atrPower = (atr && atr > 0) ? rangeCandle / atr : 0;
        let volPower = (volAvg && volAvg > 0) ? volume / volAvg : 0;

        // Angle Calculation
        let priceChange = 0;
        if (i >= angleLen) {
            priceChange = close - candles[i - angleLen].close;
        }
        let normalizedSlope = (atr && atr > 0) ? priceChange / atr : 0;
        let angle = Math.atan(normalizedSlope) * 180 / Math.PI;
        let absAngle = Math.abs(angle);

        // Volatility Momentum Score
        let angleScore = Math.min(absAngle / 90 * 40, 40);
        let atrScore = Math.min(atrPower * 20, 25);
        let volScore = Math.min(volPower * 10, 25);
        let bodyScore = Math.min(bodyPower * 10, 10);
        let volMomentumScore = angleScore + atrScore + volScore + bodyScore;

        // Signal Conditions
        let sharpUp = angle >= sharpAngle && atrPower > 1.2 && volPower > 1.5 && bodyPower > 0.55;
        let sharpDown = angle <= -sharpAngle && atrPower > 1.2 && volPower > 1.5 && bodyPower > 0.55;
        let extremeUp = angle >= extremeAngle && atrPower > 1.5 && volPower > 2.0;
        let extremeDown = angle <= -extremeAngle && atrPower > 1.5 && volPower > 2.0;
        let highMoveProbability = volMomentumScore >= 70;

        // Channel Zone
        let upperChannel = atr !== null ? close + atr * channelMult : null;
        let lowerChannel = atr !== null ? close - atr * channelMult : null;

        results.push({
            time: c.time || c.timestamp || c.datetime,
            atr: atr,
            volAvg: volAvg,
            orHigh: orHigh,
            orLow: orLow,
            angle: angle,
            volMomentumScore: volMomentumScore,
            sharpUp: sharpUp,
            sharpDown: sharpDown,
            extremeUp: extremeUp,
            extremeDown: extremeDown,
            highMoveProbability: highMoveProbability,
            upperChannel: upperChannel,
            lowerChannel: lowerChannel,
            is915: is915,
            atrPower: atrPower,
            volPower: volPower
        });
    }

    return results;
}

module.exports = {
    volatilityMomentumAngleChannelPro
};
