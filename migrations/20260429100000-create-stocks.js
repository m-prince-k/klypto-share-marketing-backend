'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Stocks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      userCode: {
        type: Sequelize.STRING
      },
      token: {
        type: Sequelize.STRING,
        allowNull: false
      },
      actualSymbol: {
        type: Sequelize.STRING
      },
      fullName: {
        type: Sequelize.STRING
      },
      segment: {
        type: Sequelize.STRING,
        defaultValue: 'NSE'
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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
    await queryInterface.dropTable('Stocks');
  }
};
