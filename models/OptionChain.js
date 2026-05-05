'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OptionChain extends Model {
    static associate(models) {
      // define association here
    }
  }
  OptionChain.init({
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    exchange: {
      type: DataTypes.STRING,
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
    underlying: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    strike: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    expiry: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    optionType: {
      type: DataTypes.STRING, // CE or PE
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
    modelName: 'OptionChain',
    tableName: 'OptionChains',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['symbol', 'exchange', 'interval', 'timestamp']
      },
      {
        fields: ['underlying', 'expiry', 'timestamp'] // Added for faster option chain queries
      }
    ]
  });
  return OptionChain;
};
