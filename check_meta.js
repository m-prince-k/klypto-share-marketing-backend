const { Sequelize } = require('sequelize');
require('dotenv').config();

async function check() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    const [meta] = await sequelize.query('SELECT name FROM "SequelizeMeta"');
    console.log('Registered Migrations:', meta.map(m => m.name));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

check();
