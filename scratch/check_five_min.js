const { OptionChain } = require('../models');

async function check() {
    try {
        const fiveMinRecords = await OptionChain.findAll({
            where: { interval: 'FIVE_MINUTE' },
            attributes: ['underlying', 'timestamp'],
            limit: 5,
            order: [['timestamp', 'DESC']]
        });
        console.log('Recent FIVE_MINUTE records:', JSON.stringify(fiveMinRecords, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
