const { DailyOptionData } = require('../models');

async function checkSnapshot() {
    try {
        const count = await DailyOptionData.count();
        const latest = await DailyOptionData.findOne({ order: [['createdAt', 'DESC']] });
        
        console.log('--- DailyOptionData Stats ---');
        console.log(`Total Records: ${count}`);
        if (latest) {
            console.log(`Latest Entry Symbol: ${latest.symbol}`);
            console.log(`Latest Entry Timestamp: ${latest.createdAt}`);
            console.log(`Snapshot Date: ${latest.timestamp}`);
        } else {
            console.log('No records found in DailyOptionData table.');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error checking DailyOptionData:', err.message);
        process.exit(1);
    }
}

checkSnapshot();
