'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OptionChainAngelOne extends Model {
    static associate(models) {
      // define association here
    }
  }
  OptionChainAngelOne.init({
    symbol: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    expiry_date: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    strike_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    option_type: {
      type: DataTypes.ENUM('CE', 'PE'),
      allowNull: false,
    },
    open: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    high: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    low: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    close: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    ltp: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    spot_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    iv: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    delta: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    },
    gamma: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    },
    theta: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    },
    vega: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    },
    volume: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    oi: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    oi_change: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    best_buy: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    best_sell: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    datetime_ist: {
      type: DataTypes.DATE, // Storing as UTC inside Postgres, but conceptually representing the specific Indian Time snapshot
      allowNull: false,
    },
  }, {
    sequelize,
    modelName: 'OptionChainAngelOne',
    tableName: 'optionChainAngelOne',
    timestamps: true, // adds createdAt and updatedAt
    indexes: [
      {
        unique: true,
        fields: ['symbol', 'expiry_date', 'strike_price', 'option_type', 'datetime_ist'],
        name: 'uniq_opt_chain_idx'
      }
    ]
  });
  return OptionChainAngelOne;
};
