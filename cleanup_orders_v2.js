const { Sequelize } = require('sequelize');
require('dotenv').config();

async function cleanUp() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: true
  });

  try {
    console.log('Aggressive Cleanup...');
    
    // Drop table with CASCADE
    await sequelize.query('DROP TABLE IF EXISTS "orders" CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS "Orders" CASCADE');
    
    // Drop indexes just in case they survived
    await sequelize.query('DROP INDEX IF EXISTS "orders_user_id"');
    await sequelize.query('DROP INDEX IF EXISTS "orders_client_id"');
    await sequelize.query('DROP INDEX IF EXISTS "orders_order_id"');
    
    console.log('Cleanup successful!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

cleanUp();
