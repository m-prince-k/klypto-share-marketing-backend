const db = require('../models');

async function checkSignals() {
    try {
        await db.sequelize.authenticate();
        console.log("DB Connected.");
        
        const count = await db.StrategySignal.count();
        console.log(`Total signals in DB: ${count}`);
        
        const latest = await db.StrategySignal.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            raw: true
        });
        
        console.log("Latest 5 signals:", JSON.stringify(latest, null, 2));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

checkSignals();
