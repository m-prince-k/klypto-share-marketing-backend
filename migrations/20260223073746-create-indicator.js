'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Indicators', {
     id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4, // Use UUIDV4 for client-side generation
      primaryKey: true,
      allowNull: false
    },
      label: {
        type: Sequelize.STRING,
         allowNull: false,
      },
      value: {
        type: Sequelize.FLOAT,
         allowNull: false,
      },
      slug: {
        type: Sequelize.STRING,
         allowNull: false,
      },
      config: {
        type: Sequelize.JSONB,
        allowNull:true
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
    await queryInterface.dropTable('Indicators');
  }
};