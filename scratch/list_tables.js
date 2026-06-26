const db = require('./models');
async function listTables() {
    await db.sequelize.authenticate();
    const tables = await db.sequelize.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", { type: db.sequelize.QueryTypes.SELECT });
    console.log(tables.map(t => t.table_name));
    process.exit();
}
listTables();
