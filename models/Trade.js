'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Trade extends Model {
    static associate(models) {
      // Define associations here if any
    }
  }
  Trade.init({
    symbol: DataTypes.STRING,
    direction: DataTypes.STRING, // Long / Short
    entryTime: DataTypes.DATE,
    exitTime: DataTypes.DATE,
    entryPrice: DataTypes.FLOAT,
    exitPrice: DataTypes.FLOAT,
    pnlValue: DataTypes.FLOAT,
    pnlPercentage: DataTypes.FLOAT,
    status: DataTypes.STRING, // OPEN, CLOSED
    reason: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Trade',
    tableName: 'trades',
  });
  return Trade;
};
