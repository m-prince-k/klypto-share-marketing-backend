'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('option_chain_data', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      excel_row_number: { type: Sequelize.INTEGER },
      relative_path: { type: Sequelize.STRING },
      sheet_name: { type: Sequelize.STRING },
      breeze_code: { type: Sequelize.STRING },
      file_fingerprint: { type: Sequelize.STRING },
      import_file: { type: Sequelize.STRING },
      ingested_at: { type: Sequelize.DATE },
      mapped_security_id: { type: Sequelize.STRING },
      mapping_sheet: { type: Sequelize.STRING },
      nse_code: { type: Sequelize.STRING },
      option_side: { type: Sequelize.STRING },
      row_num: { type: Sequelize.INTEGER },
      search_text: { type: Sequelize.TEXT },
      security_id: { type: Sequelize.STRING },
      sheet: { type: Sequelize.STRING },
      stock_name: { type: Sequelize.STRING },
      symbol: { type: Sequelize.STRING },
      bs_theoretical_price: { type: Sequelize.FLOAT },
      calc_note: { type: Sequelize.STRING },
      calc_status: { type: Sequelize.STRING },
      close: { type: Sequelize.FLOAT },
      date_ist: { type: Sequelize.STRING },
      delta: { type: Sequelize.FLOAT },
      expiry_date: { type: Sequelize.STRING },
      expiry_datetime_ist: { type: Sequelize.DATE },
      expiry_source: { type: Sequelize.STRING },
      gamma: { type: Sequelize.FLOAT },
      high: { type: Sequelize.FLOAT },
      iv: { type: Sequelize.FLOAT },
      iv_raw: { type: Sequelize.FLOAT },
      iv_source: { type: Sequelize.STRING },
      iv_used_decimal: { type: Sequelize.FLOAT },
      low: { type: Sequelize.FLOAT },
      market_price: { type: Sequelize.FLOAT },
      oi: { type: Sequelize.BIGINT },
      open: { type: Sequelize.FLOAT },
      request_option_type: { type: Sequelize.STRING },
      request_strike_selector: { type: Sequelize.STRING },
      response_leg: { type: Sequelize.STRING },
      rho: { type: Sequelize.FLOAT },
      risk_free_rate: { type: Sequelize.FLOAT },
      row_number: { type: Sequelize.INTEGER },
      side: { type: Sequelize.STRING },
      spot: { type: Sequelize.FLOAT },
      strike: { type: Sequelize.FLOAT },
      theta: { type: Sequelize.FLOAT },
      time_ist: { type: Sequelize.STRING },
      time_to_expiry_years: { type: Sequelize.FLOAT },
      timestamp_epoch: { type: Sequelize.BIGINT },
      timestamp_ist: { type: Sequelize.DATE },
      underlying_spot: { type: Sequelize.FLOAT },
      underlying_spot_source: { type: Sequelize.STRING },
      vega: { type: Sequelize.FLOAT },
      volume: { type: Sequelize.BIGINT },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add Indexes
    await queryInterface.addIndex('option_chain_data', ['symbol']);
    await queryInterface.addIndex('option_chain_data', ['expiry_date']);
    await queryInterface.addIndex('option_chain_data', ['strike']);
    await queryInterface.addIndex('option_chain_data', ['timestamp_epoch']);
    await queryInterface.addIndex('option_chain_data', ['timestamp_ist']);
    await queryInterface.addIndex('option_chain_data', ['option_side']);
    await queryInterface.addIndex('option_chain_data', ['symbol', 'expiry_date', 'strike', 'option_side'], {
      name: 'idx_symbol_expiry_strike_side'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('option_chain_data');
  }
};
