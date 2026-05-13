const { DailyOptionData, sequelize } = require('../models');

async function checkSnapshotData() {
    try {
        await sequelize.authenticate();
        console.log("Connected to DB.");

        const count = await DailyOptionData.count();
        console.log(`Total records in DailyOptionData: ${count}`);

        if (count > 0) {
            const latest = await DailyOptionData.findOne({
                order: [['createdAt', 'DESC']]
            });
            console.log("Latest entry:", JSON.stringify(latest, null, 2));

            const today = new Date().toISOString().split('T')[0];
            const todayCount = await DailyOptionData.count({
                where: { timestamp: today }
            });
            console.log(`Entries for today (${today}): ${todayCount}`);
        } else {
            console.log("No data found in DailyOptionData yet.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error checking data:", err.message);
        process.exit(1);
    }
}

checkSnapshotData();
