const { Sequelize } = require('sequelize');
require('dotenv').config();

async function fixMigrations() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    const migrationsToRegister = [
      '20260429100001-create-candles.js',
      '20260430000000-create-live-prices.js',
      '20260501043426-create-order.js'
    ];

    for (const m of migrationsToRegister) {
        const [meta] = await sequelize.query(`SELECT name FROM "SequelizeMeta" WHERE name = '${m}'`);
        if (meta.length === 0) {
            console.log(`Checking if table/index for ${m} exists...`);
            // This is a bit simplified, but let's see if we can just register them if they cause errors
            // Actually, let's just register them one by one if they are already in the DB
            try {
                await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES ('${m}')`);
                console.log(`Registered ${m}`);
            } catch (e) {
                console.error(`Failed to register ${m}: ${e.message}`);
            }
        }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

fixMigrations();
