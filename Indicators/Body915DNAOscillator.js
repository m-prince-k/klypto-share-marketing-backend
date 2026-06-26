/**
 * 9:15 Body Box DNA Oscillator
 * JavaScript Version (Equivalent of Pine Script v6)
 */

function body915DNAOscillator(candles, options = {}) {
    const lookback915 = options.lookback915 || 60;
    const boxDivisor = options.boxDivisor || 10.0;
    const marketHour = options.marketHour !== undefined ? options.marketHour : 9;
    const marketMinute = options.marketMinute !== undefined ? options.marketMinute : 15;

    let bodyArray = [];
    let results = [];
    let lastKnown915 = {
        body915: null,
        directionalBodyBoxes: null,
        bodyBoxes: null,
        avgBoxes: null,
        maxBoxes: null,
        minBoxes: null,
        bodyPercentile: null,
        expansionScore: null,
        zScore: null,
        healthy915: false,
        bull915: false,
        bear915: false,
        monsterBody: false,
        strongBody: false,
        normalBody: false,
        smallBody: false,
        status: null
    };

    for (let i = 0; i < candles.length; i++) {
        let c = candles[i];
        
        // Extract time and align to IST (+5:30) to check 9:15 properly
        let date;
        if (c.datetime) {
            date = new Date(c.datetime);
        } else if (c.timestamp) {
            date = new Date(c.timestamp);
        } else if (c.time) {
            let ms = c.time;
            if (ms < 1e12) ms *= 1000;
            date = new Date(ms);
        } else {
            date = new Date();
        }

        const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
        let h = istDate.getUTCHours();
        let m = istDate.getUTCMinutes();

        let is915 = (h === marketHour && m === marketMinute);

        if (!is915) {
            // Push empty/null state for non-9:15 candles as per PineScript logic
            results.push({
                time: c.time || c.timestamp || c.datetime,
                is915: false,
                body915: null,
                directionalBodyBoxes: null,
                bodyBoxes: null,
                avgBoxes: null,
                maxBoxes: null,
                minBoxes: null,
                bodyPercentile: null,
                expansionScore: null,
                zScore: null,
                healthy915: false,
                bull915: false,
                bear915: false,
                monsterBody: false,
                strongBody: false,
                normalBody: false,
                smallBody: false,
                status: null
            });
            continue;
        }

        // ====================================================
        // CALCULATION ONLY ON 9:15 CANDLE
        // ====================================================
        let body915 = Math.abs(c.close - c.open);
        let bull915 = c.close > c.open;
        let bear915 = c.close < c.open;

        let pastCount = bodyArray.length;

        let pastMinBody = null;
        let pastMaxBody = null;
        let pastAvgBody = null;

        if (pastCount > 0) {
            pastMinBody = Math.min(...bodyArray);
            pastMaxBody = Math.max(...bodyArray);
            let sum = bodyArray.reduce((acc, val) => acc + val, 0);
            pastAvgBody = sum / pastCount;
        } else {
            pastAvgBody = body915;
        }

        let boxSize = pastAvgBody / boxDivisor;
        if (boxSize <= 0) boxSize = 0.05;

        let bodyBoxes = body915 / boxSize;
        let minBoxes = pastMinBody !== null ? pastMinBody / boxSize : null;
        let maxBoxes = pastMaxBody !== null ? pastMaxBody / boxSize : null;
        let avgBoxes = pastAvgBody !== null ? pastAvgBody / boxSize : null;

        // SURPRISE LOGIC 1: BODY EXPANSION SCORE
        let expansionScore = pastAvgBody > 0 ? (body915 / pastAvgBody) * 100 : null;

        // SURPRISE LOGIC 2: BODY PERCENTILE
        let smallerCount = 0;
        let bodyPercentile = null;

        if (pastCount > 0) {
            for (let j = 0; j < pastCount; j++) {
                if (body915 >= bodyArray[j]) {
                    smallerCount++;
                }
            }
            bodyPercentile = (smallerCount / pastCount) * 100;
        }

        // SURPRISE LOGIC 3: Z-SCORE STYLE BODY SHOCK
        let sumDiff = 0.0;
        let zScore = null;

        if (pastCount > 1) {
            for (let j = 0; j < pastCount; j++) {
                sumDiff += Math.pow(bodyArray[j] - pastAvgBody, 2);
            }
            let stdevBody = Math.sqrt(sumDiff / pastCount);
            zScore = stdevBody > 0 ? (body915 - pastAvgBody) / stdevBody : 0;
        }

        // UPDATE ARRAY AFTER CALCULATION
        bodyArray.push(body915);
        if (bodyArray.length > lookback915) {
            bodyArray.shift();
        }

        // DIRECTIONAL OSCILLATOR
        let directionalBodyBoxes = bull915 ? bodyBoxes : (bear915 ? -bodyBoxes : 0);

        // HEALTH / STRENGTH LOGIC
        let smallBody = expansionScore !== null && expansionScore < 70;
        let normalBody = expansionScore !== null && expansionScore >= 70 && expansionScore < 130;
        let strongBody = expansionScore !== null && expansionScore >= 130 && expansionScore < 200;
        let monsterBody = expansionScore !== null && expansionScore >= 200;

        let healthy915 = expansionScore !== null && bodyPercentile !== null && expansionScore >= 100 && bodyPercentile >= 60;

        // TABLE STATUS
        let status = "SMALL BODY";
        if (monsterBody) status = "MONSTER BODY";
        else if (strongBody) status = "STRONG BODY";
        else if (normalBody) status = "NORMAL BODY";

        lastKnown915 = {
            body915: body915,
            directionalBodyBoxes: directionalBodyBoxes,
            bodyBoxes: bodyBoxes,
            avgBoxes: avgBoxes,
            maxBoxes: maxBoxes,
            minBoxes: minBoxes,
            bodyPercentile: bodyPercentile,
            expansionScore: expansionScore,
            zScore: zScore,
            healthy915: healthy915,
            bull915: bull915,
            bear915: bear915,
            monsterBody: monsterBody,
            strongBody: strongBody,
            normalBody: normalBody,
            smallBody: smallBody,
            status: status
        };

        results.push({
            time: c.time || c.timestamp || c.datetime,
            is915: true,
            ...lastKnown915
        });
    }

    return results;
}

module.exports = {
    body915DNAOscillator
};
