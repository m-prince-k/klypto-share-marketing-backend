'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Future extends Model {
    static associate(models) {
      // define association here
    }
  }
  Future.init({
    name: DataTypes.STRING,
    fullName: DataTypes.STRING,
    symbol: DataTypes.STRING,
    userCode: DataTypes.STRING,
    segment: DataTypes.STRING,
    type: {
        type: DataTypes.STRING,
        defaultValue: 'FUTURE'
    },
    expiry: DataTypes.STRING,
    token: {
        type: DataTypes.STRING,
        unique: true
    }
  }, {
    sequelize,
    modelName: 'Future',
  });
  return Future;
};
