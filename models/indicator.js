'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Indicator extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Indicator.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    label: {type:DataTypes.STRING,allowNull:false},
    slug: {type:DataTypes.STRING,allowNull:false},
    value: {
      type:DataTypes.FLOAT,
      allowNull:false
    },
    config: {
      type:DataTypes.JSONB,
      allowNull:true
    }
  }, {
    sequelize,
    modelName: 'Indicator',
    timestamps:true
  });
  return Indicator;
};