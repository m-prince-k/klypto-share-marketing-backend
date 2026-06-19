'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('LivePrices', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      symbol: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      token: {
        type: Sequelize.STRING,
        allowNull: false
      },
      ltp: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      open: {
        type: Sequelize.DECIMAL(10, 2)
      },
      high: {
        type: Sequelize.DECIMAL(10, 2)
      },
      low: {
        type: Sequelize.DECIMAL(10, 2)
      },
      close: {
        type: Sequelize.DECIMAL(10, 2)
      },
      volume: {
        type: Sequelize.BIGINT
      },
      fetchedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
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
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('LivePrices');
  }
};
