const { OptionChain } = require('../models');

async function checkRange() {
    try {
        const minDate = await OptionChain.min('timestamp');
        const count = await OptionChain.count();

        console.log(`Total Records: ${count}`);
        console.log(`Oldest Record Date: ${minDate}`);
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkRange();
