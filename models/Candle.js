'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Candle extends Model {
    static associate(models) {
      // define association here
    }
  }
  Candle.init({
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    exchange: {
      type: DataTypes.STRING, // NSE or NFO
      allowNull: false
    },
    interval: {
      type: DataTypes.STRING,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false
    },
    open: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    high: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    low: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    close: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    volume: {
      type: DataTypes.BIGINT,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Candle',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['symbol', 'interval', 'timestamp'] // Prevent duplicate candles
      }
    ]
  });
  return Candle;
};
