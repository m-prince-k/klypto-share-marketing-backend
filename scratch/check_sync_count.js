const { OptionChain } = require('../models');
const { Sequelize } = require('sequelize');

async function check() {
    const count = await OptionChain.count({
        where: { underlying: 'ABB' }
    });
    console.log(`Current record count for ABB in OptionChain: ${count}`);
    
    if (count > 0) {
        const sample = await OptionChain.findOne({
            where: { underlying: 'ABB' },
            order: [['timestamp', 'DESC']]
        });
        console.log(`Latest record timestamp: ${sample.timestamp}`);
    }
    process.exit(0);
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
