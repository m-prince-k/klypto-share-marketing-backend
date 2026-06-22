const { sequelize, OptionChain } = require('../models');

async function checkNiftyRange() {
    try {
        const minDate = await OptionChain.min('timestamp', { where: { underlying: 'NIFTY' } });
        const maxDate = await OptionChain.max('timestamp', { where: { underlying: 'NIFTY' } });
        const count = await OptionChain.count({ where: { underlying: 'NIFTY' } });

        console.log(`NIFTY Options Data Count: ${count}`);
        console.log(`Oldest Record: ${minDate}`);
        console.log(`Latest Record: ${maxDate}`);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkNiftyRange();
