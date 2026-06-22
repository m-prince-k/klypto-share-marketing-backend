const { DailyOptionData } = require('../models');
const { sequelize } = require('../models');

async function check() {
    try {
        await sequelize.authenticate();
        const count = await DailyOptionData.count();
        console.log(`Total records in DailyOptionData: ${count}`);
        
        const latest = await DailyOptionData.findOne({ order: [['createdAt', 'DESC']] });
        if (latest) {
            console.log(`Latest record timestamp: ${latest.createdAt}`);
            console.log(`Latest record underlying: ${latest.underlying}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
