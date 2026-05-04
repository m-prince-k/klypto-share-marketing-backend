const { Sequelize } = require('sequelize');
require('dotenv').config();

async function cleanUp() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    console.log('Dropping "orders" table to resolve migration conflict...');
    await sequelize.query('DROP TABLE IF EXISTS "orders" CASCADE');
    console.log('Drop successful!');

    console.log('Dropping "Orders" (if exists) table...');
    await sequelize.query('DROP TABLE IF EXISTS "Orders" CASCADE');
    console.log('Drop successful!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

cleanUp();
