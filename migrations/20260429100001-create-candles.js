'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Candles', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false
      },
      token: {
        type: Sequelize.STRING,
        allowNull: false
      },
      exchange: {
        type: Sequelize.STRING,
        allowNull: false
      },
      interval: {
        type: Sequelize.STRING,
        allowNull: false
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false
      },
      open: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      high: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      low: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      close: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      volume: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add unique index to prevent duplicate candles
    await queryInterface.addIndex('Candles', ['symbol', 'interval', 'timestamp'], {
      unique: true,
      name: 'candles_symbol_interval_timestamp_unique'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Candles');
  }
};
