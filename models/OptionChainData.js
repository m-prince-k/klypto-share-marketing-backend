'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OptionChainData extends Model {
    static associate(models) {
      // define association here
    }
  }
  OptionChainData.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    excel_row_number: DataTypes.INTEGER,
    relative_path: DataTypes.STRING,
    sheet_name: DataTypes.STRING,
    breeze_code: DataTypes.STRING,
    file_fingerprint: DataTypes.STRING,
    import_file: DataTypes.STRING,
    ingested_at: DataTypes.DATE,
    mapped_security_id: DataTypes.STRING,
    mapping_sheet: DataTypes.STRING,
    nse_code: DataTypes.STRING,
    option_side: DataTypes.STRING,
    row_num: DataTypes.INTEGER,
    search_text: DataTypes.TEXT,
    security_id: DataTypes.STRING,
    sheet: DataTypes.STRING,
    stock_name: DataTypes.STRING,
    symbol: DataTypes.STRING,
    bs_theoretical_price: DataTypes.FLOAT,
    calc_note: DataTypes.STRING,
    calc_status: DataTypes.STRING,
    close: DataTypes.FLOAT,
    date_ist: DataTypes.STRING,
    delta: DataTypes.FLOAT,
    expiry_date: DataTypes.STRING,
    expiry_datetime_ist: DataTypes.DATE,
    expiry_source: DataTypes.STRING,
    gamma: DataTypes.FLOAT,
    high: DataTypes.FLOAT,
    iv: DataTypes.FLOAT,
    iv_raw: DataTypes.FLOAT,
    iv_source: DataTypes.STRING,
    iv_used_decimal: DataTypes.FLOAT,
    low: DataTypes.FLOAT,
    market_price: DataTypes.FLOAT,
    oi: DataTypes.BIGINT,
    open: DataTypes.FLOAT,
    request_option_type: DataTypes.STRING,
    request_strike_selector: DataTypes.STRING,
    response_leg: DataTypes.STRING,
    rho: DataTypes.FLOAT,
    risk_free_rate: DataTypes.FLOAT,
    row_number: DataTypes.INTEGER,
    side: DataTypes.STRING,
    spot: DataTypes.FLOAT,
    strike: DataTypes.FLOAT,
    theta: DataTypes.FLOAT,
    time_ist: DataTypes.STRING,
    time_to_expiry_years: DataTypes.FLOAT,
    timestamp_epoch: DataTypes.BIGINT,
    timestamp_ist: DataTypes.DATE,
    underlying_spot: DataTypes.FLOAT,
    underlying_spot_source: DataTypes.STRING,
    vega: DataTypes.FLOAT,
    volume: DataTypes.BIGINT
  }, {
    sequelize,
    modelName: 'OptionChainData',
    tableName: 'option_chain_data',
    timestamps: true,
    indexes: [
      { fields: ['symbol'] },
      { fields: ['expiry_date'] },
      { fields: ['strike'] },
      { fields: ['timestamp_epoch'] },
      { fields: ['timestamp_ist'] },
      { fields: ['option_side'] },
      { fields: ['symbol', 'expiry_date', 'strike', 'option_side'] },
      { fields: ['symbol', 'expiry_date', 'timestamp_epoch'] }
    ]
  });
  return OptionChainData;
};
