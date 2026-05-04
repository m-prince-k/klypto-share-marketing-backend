const { Sequelize } = require('sequelize');
require('dotenv').config();

async function inspectAll() {
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    port: process.env.DB_PORT,
    logging: false
  });

  try {
    const [tables] = await sequelize.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log('Tables:', tables.map(t => t.tablename).join(', '));
    
    const [indexes] = await sequelize.query("SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public'");
    console.log('\nIndexes:');
    indexes.forEach(i => console.log(` - ${i.indexname} (on ${i.tablename})`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

inspectAll();
