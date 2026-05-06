const { OptionChain } = require('../models');

async function check() {
    try {
        const abbRecords = await OptionChain.findAll({
            where: { underlying: 'ABB' },
            attributes: ['timestamp', 'interval'],
            limit: 5,
            order: [['timestamp', 'DESC']]
        });
        console.log('Recent ABB timestamps:', JSON.stringify(abbRecords, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
