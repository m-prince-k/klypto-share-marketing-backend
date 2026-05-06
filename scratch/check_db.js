const { OptionChain } = require('../models');

async function check() {
    try {
        const count = await OptionChain.count();
        console.log(`Total records in OptionChain: ${count}`);
        
        if (count > 0) {
            const latest = await OptionChain.findOne({ order: [['createdAt', 'DESC']] });
            console.log('Latest record:', JSON.stringify(latest, null, 2));
            
            const nullUnderlying = await OptionChain.count({ where: { underlying: null } });
            console.log(`Records with null underlying: ${nullUnderlying}`);
            
            const distinctUnderlyings = await OptionChain.findAll({
                attributes: [[OptionChain.sequelize.fn('DISTINCT', OptionChain.sequelize.col('underlying')), 'underlying']],
                raw: true
            });
            console.log('Distinct underlyings:', distinctUnderlyings.map(d => d.underlying));
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
