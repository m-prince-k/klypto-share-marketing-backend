const { OptionChain } = require('../models');
const { Op } = require('sequelize');

async function check() {
    try {
        const symbol = 'NIFTY';
        const count = await OptionChain.count({
            where: { underlying: symbol }
        });
        console.log(`Total records for ${symbol}: ${count}`);
        
        if (count > 0) {
            const minTimestamp = await OptionChain.min('timestamp', { where: { underlying: symbol } });
            const maxTimestamp = await OptionChain.max('timestamp', { where: { underlying: symbol } });
            console.log(`Data range for ${symbol}: ${minTimestamp} to ${maxTimestamp}`);
            
            const distinctTokens = await OptionChain.count({
                distinct: true,
                col: 'token',
                where: { underlying: symbol }
            });
            console.log(`Distinct contracts for ${symbol}: ${distinctTokens}`);
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
