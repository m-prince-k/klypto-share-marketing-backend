const { Sequelize } = require('sequelize');
require('dotenv').config();

async function fixMigration() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    console.log('Checking database status...');
    
    // Check if table exists
    const [tables] = await sequelize.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Candles'");
    if (tables.length > 0) {
      console.log('Table "Candles" exists.');
      
      const [indexes] = await sequelize.query("SELECT indexname FROM pg_indexes WHERE tablename = 'Candles' AND indexname = 'candles_symbol_interval_timestamp_unique'");
      if (indexes.length > 0) {
        console.log('Index "candles_symbol_interval_timestamp_unique" already exists.');
        
        // Check if migration is registered
        const [meta] = await sequelize.query('SELECT name FROM "SequelizeMeta" WHERE name = \'20260429100001-create-candles.js\'');
        if (meta.length === 0) {
          console.log('Migration "20260429100001-create-candles.js" is NOT registered. Registering it now...');
          await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (\'20260429100001-create-candles.js\')');
          console.log('Registration successful!');
        } else {
          console.log('Migration is already registered.');
        }
      }
    } else {
      console.log('Table "Candles" does not exist. The error might be different.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

fixMigration();
