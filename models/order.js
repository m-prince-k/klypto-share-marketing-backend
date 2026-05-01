module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define("Order", {
    
    // 🔹 Primary Key (UUID)
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // 🔹 Angel One Order ID
    order_id: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // 🔹 User Mapping
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    // 🔹 Angel Client Code
    uniqueorderid: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // 🔹 Order Info
    tradingsymbol: DataTypes.STRING,
    symboltoken: DataTypes.STRING,
    transactiontype: DataTypes.STRING,
    ordertype: DataTypes.STRING,

    price: DataTypes.FLOAT,
    quantity: DataTypes.INTEGER,

    exchange: DataTypes.STRING,
    product_type: DataTypes.STRING,
    duration: DataTypes.STRING,

    // 🔹 Status Tracking
    status: {
      type: DataTypes.STRING,
      defaultValue: "OPEN"
    },
    status_message: DataTypes.TEXT,

    average_price: DataTypes.FLOAT,
    filled_quantity: DataTypes.INTEGER,
    pending_quantity: DataTypes.INTEGER,

    order_time: DataTypes.DATE,
    exchange_time: DataTypes.DATE,

    // 🔹 Debugging
    raw_response: DataTypes.JSONB,
    status: DataTypes.BOOLEAN

  }, {
    tableName: "orders",
    timestamps: true
  });

  return Order;
};