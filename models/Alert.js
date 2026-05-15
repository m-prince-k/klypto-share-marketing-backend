'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Alert extends Model {
    static associate(models) {
      // Alert.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }
  Alert.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    symbol: { type: DataTypes.STRING, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: false },
    exchange: { type: DataTypes.STRING, allowNull: false },
    interval: { type: DataTypes.STRING, allowNull: false },
    indicator: { type: DataTypes.STRING, allowNull: false },
    params: { type: DataTypes.JSONB, allowNull: true },
    operator: { type: DataTypes.STRING, allowNull: false }, // >, <, crosses, crosses_up, crosses_down
    value: { type: DataTypes.FLOAT, allowNull: false },
    triggerType: { 
      type: DataTypes.ENUM('once', 'once_per_bar', 'every_tick'),
      defaultValue: 'once_per_bar'
    },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastTriggeredAt: { type: DataTypes.DATE, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: true }
  }, {
    sequelize,
    modelName: 'Alert',
    timestamps: true
  });
  return Alert;
};
