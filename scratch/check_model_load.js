const db = require('../models');

console.log("Loaded Models:", Object.keys(db).filter(k => k !== 'sequelize' && k !== 'Sequelize'));
if (db.OptionChain) {
    console.log("OptionChain Model exists!");
    console.log("Table Name:", db.OptionChain.tableName);
} else {
    console.log("OptionChain Model is MISSING!");
}
process.exit(0);
