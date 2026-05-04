'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {

      // 🔹 Primary UUID ID
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false
      },
      // 🔹 User Mapping
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // 🔹 Angel Order ID
      order_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      strike_price: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      expirey_date:{
        type:Sequelize.DATE,
        allowNull: false
      },  
      // 🔹 Client Code
      uniqueorderid: {
        type: Sequelize.STRING,
        allowNull: false
      },
      client_id: {
        type: Sequelize.STRING,
        allowNull: true
      },

      // 🔹 Order Fields
      tradingsymbol: {
        type: Sequelize.STRING
      },
      symboltoken: {
        type: Sequelize.STRING
      },
      transactiontype: {
        type: Sequelize.STRING
      },
      ordertype: {
        type: Sequelize.STRING
      },

      price: {
        type: Sequelize.FLOAT
      },
      quantity: {
        type: Sequelize.INTEGER
      },

      exchange: {
        type: Sequelize.STRING
      },
      product_type: {
        type: Sequelize.STRING
      },
      duration: {
        type: Sequelize.STRING
      },

      // 🔹 Status
      status: {
        type: Sequelize.STRING,
        defaultValue: 'OPEN'
      },
      status_message: {
        type: Sequelize.TEXT
      },

      average_price: {
        type: Sequelize.FLOAT
      },
      filled_quantity: {
        type: Sequelize.INTEGER
      },
      pending_quantity: {
        type: Sequelize.INTEGER
      },

      order_time: {
        type: Sequelize.DATE
      },
      exchange_time: {
        type: Sequelize.DATE
      },

      // 🔹 Debug JSON
      raw_response: {
        type: Sequelize.JSONB
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },

      // 🔹 Timestamps
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }

    });

    // 🔥 Indexes (important for performance)
    await queryInterface.addIndex('orders', ['user_id']);
    await queryInterface.addIndex('orders', ['client_id']);
    await queryInterface.addIndex('orders', ['order_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('orders');
  }
};