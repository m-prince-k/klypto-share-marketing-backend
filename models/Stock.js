'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Stock extends Model {
    static associate(models) {
      // define association here
    }
  }
  Stock.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userCode: {
      type: DataTypes.STRING
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false
    },
    actualSymbol: {
      type: DataTypes.STRING
    },
    fullName: {
      type: DataTypes.STRING
    },
    segment: {
      type: DataTypes.STRING,
      defaultValue: 'NSE'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'Stock',
  });
  return Stock;
};
