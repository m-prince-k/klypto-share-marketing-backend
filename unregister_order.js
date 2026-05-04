const { Sequelize } = require('sequelize');
require('dotenv').config();

async function unregister() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    await sequelize.query('DELETE FROM "SequelizeMeta" WHERE name = \'20260501043426-create-order.js\'');
    console.log('Unregistered order migration successfully.');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

unregister();
