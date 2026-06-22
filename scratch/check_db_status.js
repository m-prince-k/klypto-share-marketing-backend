const { Candle, OptionChain } = require('../models');

async function checkCounts() {
    try {
        const candleCount = await Candle.count();
        const optionCount = await OptionChain.count();
        
        console.log("-----------------------------------------");
        console.log(`Current Candle (Stocks) Count: ${candleCount}`);
        console.log(`Current OptionChain Count: ${optionCount}`);
        
        if (optionCount > 0) {
            const sample = await OptionChain.findOne({ order: [['createdAt', 'DESC']] });
            console.log("Latest Option Record Sample:", JSON.stringify({
                symbol: sample.symbol,
                underlying: sample.underlying,
                strike: sample.strike,
                timestamp: sample.timestamp
            }, null, 2));
        }
        console.log("-----------------------------------------");
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkCounts();
