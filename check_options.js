require('dotenv').config();
const { DailyOptionData } = require('./models');
const { Op } = require('sequelize');

async function checkOptions() {
    try {
        const total = await DailyOptionData.count();
        
        const todayStart = new Date();
        todayStart.setUTCHours(3, 45, 0, 0); // 09:15 IST
        
        const countToday = await DailyOptionData.count({
            where: {
                updatedAt: {
                    [Op.gte]: todayStart
                }
            }
        });
        
        console.log(`Total DailyOptionData entries: ${total}`);
        console.log(`DailyOptionData entries updated today since 09:15 IST: ${countToday}`);
        
        const latest = await DailyOptionData.findOne({
            order: [['updatedAt', 'DESC']]
        });
        
        if (latest) {
            console.log(`Latest entry UPDATE time: ${new Date(latest.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
            console.log(`Latest entry DATE (timestamp): ${new Date(latest.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
            console.log(`Latest symbol: ${latest.symbol}`);
        } else {
            console.log('No entries found.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

checkOptions();
