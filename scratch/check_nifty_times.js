const { OptionChain } = require('../models');
const { Op } = require('sequelize');

async function checkExactTime() {
    try {
        const records = await OptionChain.findAll({
            where: {
                underlying: 'NIFTY',
                timestamp: {
                    [Op.between]: [new Date("2026-04-25 10:00:00"), new Date("2026-04-25 10:30:00")]
                }
            },
            attributes: ['timestamp'],
            group: ['timestamp'],
            order: [['timestamp', 'ASC']],
            raw: true
        });

        console.log("Available Exact Timestamps around 25 April 10:15 AM:");
        records.forEach(r => console.log(new Date(r.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })));
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkExactTime();
