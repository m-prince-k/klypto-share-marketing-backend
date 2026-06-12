'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StrategySignal extends Model {
    static associate(models) {
      // Define associations here if any
    }
  }
  StrategySignal.init({
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true // Upsert operations will use symbol as the unique key
    },
    signalType: DataTypes.STRING, // BUY, SELL, NONE
    indicatorValues: DataTypes.JSON, // JSON string or object to store dynamic markers/indicators
    timestamp: DataTypes.DATE, // Time of the last signal or evaluation
    message: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'StrategySignal',
    tableName: 'strategy_signals',
  });
  return StrategySignal;
};