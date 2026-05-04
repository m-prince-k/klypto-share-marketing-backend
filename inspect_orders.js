const { Sequelize } = require('sequelize');
require('dotenv').config();

async function inspectOrders() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    const [cols] = await sequelize.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Orders'");
    console.log('Orders Columns:', cols.map(c => c.column_name).join(', '));
    
    const [count] = await sequelize.query('SELECT count(*) FROM "Orders"');
    console.log('Orders Count:', count[0].count);

  } catch (error) {
    console.log('Orders table does not exist or error:', error.message);
  } finally {
    await sequelize.close();
  }
}

inspectOrders();
