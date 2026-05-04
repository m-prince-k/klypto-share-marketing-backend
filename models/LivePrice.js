'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LivePrice extends Model {
    static associate(models) {
      // associations can be defined here
    }
  }
  LivePrice.init({
    symbol: {
      type: DataTypes.STRING,
      allowNull: false
    },
    exchange: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'NSE'
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    ltp: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    open: {
      type: DataTypes.DECIMAL(10, 2)
    },
    high: {
      type: DataTypes.DECIMAL(10, 2)
    },
    low: {
      type: DataTypes.DECIMAL(10, 2)
    },
    close: {
      type: DataTypes.DECIMAL(10, 2)
    },
    volume: {
      type: DataTypes.BIGINT
    },
    fetchedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'LivePrice',
    timestamps: true
  });
  return LivePrice;
};
