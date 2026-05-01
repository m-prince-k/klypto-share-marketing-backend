'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Timeframes', {
      id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4, // Use UUIDV4 for client-side generation
      primaryKey: true,
      allowNull: false
    },
      category: {
        type: Sequelize.STRING
      },
      label: {
        type: Sequelize.STRING
      },
      value: {
        type: Sequelize.STRING
      },
      seconds: {
        type: Sequelize.INTEGER
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
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Timeframes');
  }
};