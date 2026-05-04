'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. LivePrices table updates
    // Add exchange column if not exists
    const tableInfo = await queryInterface.describeTable('LivePrices');
    if (!tableInfo.exchange) {
        await queryInterface.addColumn('LivePrices', 'exchange', {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'NSE'
        });
    }

    // Update unique index for LivePrices
    try {
        await queryInterface.removeIndex('LivePrices', 'LivePrices_symbol_key');
    } catch (e) {
        console.log('Index LivePrices_symbol_key not found, skipping removal');
    }
    await queryInterface.addIndex('LivePrices', ['symbol', 'exchange'], {
        unique: true,
        name: 'live_prices_symbol_exchange_unique'
    });

    // 2. Stocks table updates
    try {
        await queryInterface.removeIndex('Stocks', 'Stocks_name_key');
    } catch (e) {
        console.log('Index Stocks_name_key not found, skipping removal');
    }
    await queryInterface.addIndex('Stocks', ['name', 'segment'], {
        unique: true,
        name: 'stocks_name_segment_unique'
    });

    // 3. Candles table updates
    try {
        await queryInterface.removeIndex('Candles', 'candles_symbol_interval_timestamp_unique');
    } catch (e) {
        console.log('Index candles_symbol_interval_timestamp_unique not found, skipping removal');
    }
    await queryInterface.addIndex('Candles', ['symbol', 'exchange', 'interval', 'timestamp'], {
        unique: true,
        name: 'candles_symbol_exchange_interval_timestamp_unique'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert Candles index
    await queryInterface.removeIndex('Candles', 'candles_symbol_exchange_interval_timestamp_unique');
    await queryInterface.addIndex('Candles', ['symbol', 'interval', 'timestamp'], {
        unique: true,
        name: 'candles_symbol_interval_timestamp_unique'
    });

    // Revert Stocks index
    await queryInterface.removeIndex('Stocks', 'stocks_name_segment_unique');
    await queryInterface.addIndex('Stocks', ['name'], {
        unique: true,
        name: 'Stocks_name_key'
    });

    // Revert LivePrices index and column
    await queryInterface.removeIndex('LivePrices', 'live_prices_symbol_exchange_unique');
    await queryInterface.addIndex('LivePrices', ['symbol'], {
        unique: true,
        name: 'LivePrices_symbol_key'
    });
    await queryInterface.removeColumn('LivePrices', 'exchange');
  }
};
