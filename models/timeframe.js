'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Timeframe extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Timeframe.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    category: DataTypes.STRING,
    label: DataTypes.STRING,
    value: DataTypes.STRING,
    seconds: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Timeframe',
    tableName: 'Timeframes',
    timestamps: true
  });
  return Timeframe;
};