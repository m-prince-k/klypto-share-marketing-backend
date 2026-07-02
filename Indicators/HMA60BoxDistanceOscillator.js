/**
 * HMA 60 Box Distance Oscillator
 * JavaScript Version (Equivalent of Pine Script v6)
 */

function hma60BoxDistanceOscillator(candle, hmaValue, atrValue, options = {}) {
    const boxAtrMult = options.boxAtrMult || 0.25;
    const upperZone = options.upperZone || 5.0;
    const lowerZone = options.lowerZone || -5.0;

    // BOX SIZE LOGIC
    let boxSize = atrValue * boxAtrMult;
    if (boxSize <= 0) boxSize = 0.05;

    // DISTANCE IN BOXES
    const highToHmaBoxes = (candle.high - hmaValue) / boxSize;
    const lowToHmaBoxes = (candle.low - hmaValue) / boxSize;
    const closeToHmaBoxes = (candle.close - hmaValue) / boxSize;

    // EXTREME ZONES
    const upperExtreme = highToHmaBoxes >= upperZone;
    const lowerExtreme = lowToHmaBoxes <= lowerZone;

    // BACKGROUND LOGIC
    let bgColor = null;
    if (upperExtreme) {
        bgColor = "rgba(0, 128, 0, 0.12)"; // Equivalent to color.new(color.green, 88)
    } else if (lowerExtreme) {
        bgColor = "rgba(255, 0, 0, 0.12)"; // Equivalent to color.new(color.red, 88)
    }

    return {
        hma60: hmaValue,
        atrValue: atrValue,
        boxSize: boxSize,
        highToHmaBoxes: highToHmaBoxes,
        lowToHmaBoxes: lowToHmaBoxes,
        closeToHmaBoxes: closeToHmaBoxes,
        upperZone: upperZone,
        lowerZone: lowerZone,
        upperExtreme: upperExtreme,
        lowerExtreme: lowerExtreme,
        bgColor: bgColor
    };
}

module.exports = { hma60BoxDistanceOscillator };