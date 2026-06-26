/**
 * Healthy Candle Box Oscillator
 * JavaScript Version (Equivalent of Pine Script v6)
 *
 * candle = {
 *   open: Number,
 *   high: Number,
 *   low: Number,
 *   close: Number
 * }
 */

function healthyCandleBoxOscillator(candle, atrValue, options = {}) {

    const {
        atrMultiplier = 0.25,
        minBodyBox = 1.5,
        maxWickBody = 0.60,
        maxOneWick = 0.45,
        atrLength = 14
    } = options;

    // ---------------------------------
    // Adaptive Box Size
    // ---------------------------------

    let boxSize = atrValue * atrMultiplier;

    if (boxSize <= 0)
        boxSize = 0.01;

    // ---------------------------------
    // Candle Parts
    // ---------------------------------

    const body = Math.abs(candle.close - candle.open);

    const upperWick =
        candle.high - Math.max(candle.open, candle.close);

    const lowerWick =
        Math.min(candle.open, candle.close) - candle.low;

    const totalWick = upperWick + lowerWick;

    const candleRange =
        candle.high - candle.low;

    // ---------------------------------
    // Convert to Boxes
    // ---------------------------------

    const bodyBoxes =
        body / boxSize;

    const upperWickBoxes =
        upperWick / boxSize;

    const lowerWickBoxes =
        lowerWick / boxSize;

    const totalWickBoxes =
        totalWick / boxSize;

    // ---------------------------------
    // Ratios
    // ---------------------------------

    const wickBodyRatio =
        body > 0 ? totalWick / body : 999;

    const upperRatio =
        body > 0 ? upperWick / body : 999;

    const lowerRatio =
        body > 0 ? lowerWick / body : 999;

    const bodyPercent =
        candleRange > 0
            ? (body / candleRange) * 100
            : 0;

    // ---------------------------------
    // Health Logic
    // ---------------------------------

    const healthyBody =
        bodyBoxes >= minBodyBox;

    const wickOk =
        wickBodyRatio <= maxWickBody;

    const upperOk =
        upperRatio <= maxOneWick;

    const lowerOk =
        lowerRatio <= maxOneWick;

    const healthy =
        healthyBody &&
        wickOk &&
        upperOk &&
        lowerOk;

    // ---------------------------------
    // Direction
    // ---------------------------------

    const bull =
        candle.close > candle.open;

    const bear =
        candle.close < candle.open;

    // ---------------------------------
    // Oscillator Score
    // ---------------------------------

    const bodyScore =
        Math.min(
            (bodyBoxes / minBodyBox) * 40,
            40
        );

    const wickScore =
        Math.max(
            40 - (wickBodyRatio * 40),
            0
        );

    const bodyPctScore =
        Math.min(
            (bodyPercent / 70) * 20,
            20
        );

    let healthScore =
        bodyScore +
        wickScore +
        bodyPctScore;

    healthScore =
        Math.min(healthScore, 100);

    // ---------------------------------
    // Directional Oscillator
    // ---------------------------------

    const directionalScore =
        bull
            ? healthScore
            : bear
                ? -healthScore
                : 0;

    return {

        // Box Size
        boxSize,

        // Candle Values
        body,
        upperWick,
        lowerWick,
        totalWick,
        candleRange,

        // Boxes
        bodyBoxes,
        upperWickBoxes,
        lowerWickBoxes,
        totalWickBoxes,

        // Ratios
        wickBodyRatio,
        upperRatio,
        lowerRatio,
        bodyPercent,

        // Conditions
        healthyBody,
        wickOk,
        upperOk,
        lowerOk,
        healthy,

        // Direction
        bull,
        bear,

        // Scores
        bodyScore,
        wickScore,
        bodyPctScore,
        healthScore,
        directionalScore
    };
}

module.exports = { healthyCandleBoxOscillator };