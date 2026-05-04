const { Sequelize } = require('sequelize');
require('dotenv').config();

async function fixAllMigrations() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    const allMigrations = [
      '20260223063758-create-timeframe.js',
      '20260223073746-create-indicator.js',
      '20260429100000-create-stocks.js',
      '20260429100001-create-candles.js',
      '20260430000000-create-live-prices.js',
      '20260501090000-create-user.js'
    ];

    console.log('Ensuring SequelizeMeta table exists...');
    await sequelize.query('CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) PRIMARY KEY)');

    for (const m of allMigrations) {
        const [meta] = await sequelize.query(`SELECT name FROM "SequelizeMeta" WHERE name = '${m}'`);
        if (meta.length === 0) {
            console.log(`Registering existing migration: ${m}`);
            await sequelize.query(`INSERT INTO "SequelizeMeta" (name) VALUES ('${m}')`);
        } else {
            console.log(`Already registered: ${m}`);
        }
    }
    
    console.log('\nMigrations Sync Complete! Now you can run db:migrate for the remaining ones.');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

fixAllMigrations();
