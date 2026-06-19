'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DailyOptionData extends Model {
    static associate(models) {
      // associations can be defined here
    }
  }
  DailyOptionData.init({
    underlying: {
      type: DataTypes.STRING,
      allowNull: false
    },
    symbol: {
      type: DataTypes.STRING,
      allowNull: false
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    exchange: {
      type: DataTypes.STRING,
      defaultValue: 'NFO'
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
    ltp: {
      type: DataTypes.DECIMAL(10, 2),
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
    oi: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    oiChange: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    iv: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    netChange: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    bidPrice: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    bidQty: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    askPrice: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    askQty: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    volume: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    timestamp: {
      type: DataTypes.DATEONLY, // Store only the Date to prevent duplicates on the same day
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'DailyOptionData',
    tableName: 'DailyOptionData',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['token', 'timestamp'] // Prevents duplicate entry for the same contract on the same day
      },
      {
        fields: ['underlying', 'timestamp']
      }
    ]
  });
  return DailyOptionData;
};
