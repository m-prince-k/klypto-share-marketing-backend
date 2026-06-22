const { sequelize } = require('../models');

async function listTables() {
    try {
        const [results] = await sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
        console.log("Tables in DB:", results.map(r => r.table_name));
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

listTables();
