module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mobile: DataTypes.STRING,
    otp: DataTypes.INTEGER,
    expiresAt: DataTypes.DATE,
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    rule: DataTypes.STRING,
    ruleVerified: DataTypes.BOOLEAN,
    alertName: DataTypes.STRING,
  }, {
    tableName: 'Users',
    timestamps: true,
    paranoid: true,
  });
  User.associate = models => {
    // Add associations here when related models exist
    if (models.CustomIndicator) User.hasMany(models.CustomIndicator, { foreignKey: 'userId', onDelete: 'CASCADE' });
    if (models.CreateAlert) User.hasMany(models.CreateAlert, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };
  return User;
};
