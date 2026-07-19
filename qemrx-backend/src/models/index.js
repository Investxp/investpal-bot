const { Sequelize, DataTypes } = require('sequelize');

const sequelizeOptions = {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, sequelizeOptions)
  : new Sequelize(
      process.env.DB_NAME || 'qemrx_pharmacy',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASSWORD || '',
      { ...sequelizeOptions, host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT) || 5432 }
    );

// ── MODELS ──────────────────────────────────────────────────

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true },
  phone: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('customer', 'pharmacist', 'admin'), defaultValue: 'customer' },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  address: { type: DataTypes.TEXT },
  county: { type: DataTypes.STRING, defaultValue: 'Nairobi' },
}, { tableName: 'users', underscored: true });

const Product = sequelize.define('Product', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  brand: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('otc', 'rx'), defaultValue: 'otc' },
  description: { type: DataTypes.TEXT },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  oldPrice: { type: DataTypes.DECIMAL(10, 2) },
  stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  emoji: { type: DataTypes.STRING(10), defaultValue: '💊' },
  imageUrl: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  requiresPrescription: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'products', underscored: true });

const Order = sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderNumber: { type: DataTypes.STRING, unique: true },
  userId: { type: DataTypes.UUID },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'),
    defaultValue: 'pending',
  },
  subtotal: { type: DataTypes.DECIMAL(10, 2) },
  deliveryFee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 150 },
  total: { type: DataTypes.DECIMAL(10, 2) },
  paymentMethod: { type: DataTypes.ENUM('mpesa', 'card', 'cash'), defaultValue: 'mpesa' },
  paymentStatus: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), defaultValue: 'pending' },
  deliveryAddress: { type: DataTypes.TEXT, allowNull: false },
  deliveryPhone: { type: DataTypes.STRING, allowNull: false },
  deliveryNotes: { type: DataTypes.TEXT },
  estimatedDelivery: { type: DataTypes.DATE },
  requiresPrescription: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'orders', underscored: true });

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID },
  productId: { type: DataTypes.UUID },
  productName: { type: DataTypes.STRING },
  quantity: { type: DataTypes.INTEGER },
  unitPrice: { type: DataTypes.DECIMAL(10, 2) },
  subtotal: { type: DataTypes.DECIMAL(10, 2) },
}, { tableName: 'order_items', underscored: true });

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID },
  method: { type: DataTypes.ENUM('mpesa', 'card', 'cash') },
  amount: { type: DataTypes.DECIMAL(10, 2) },
  status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'), defaultValue: 'pending' },
  // M-Pesa specific
  mpesaCheckoutRequestId: { type: DataTypes.STRING },
  mpesaMerchantRequestId: { type: DataTypes.STRING },
  mpesaReceiptNumber: { type: DataTypes.STRING },
  mpesaPhone: { type: DataTypes.STRING },
  // Stripe specific
  stripePaymentIntentId: { type: DataTypes.STRING },
  stripeClientSecret: { type: DataTypes.STRING },
  // Meta
  rawResponse: { type: DataTypes.JSONB },
  paidAt: { type: DataTypes.DATE },
}, { tableName: 'payments', underscored: true });

const Prescription = sequelize.define('Prescription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID },
  orderId: { type: DataTypes.UUID },
  patientName: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  fileUrl: { type: DataTypes.STRING, allowNull: false },
  fileName: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('pending', 'reviewing', 'approved', 'rejected'), defaultValue: 'pending' },
  pharmacistNotes: { type: DataTypes.TEXT },
  reviewedBy: { type: DataTypes.UUID },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'prescriptions', underscored: true });

const Cart = sequelize.define('Cart', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID },
  sessionId: { type: DataTypes.STRING }, // for guest carts
  items: { type: DataTypes.JSONB, defaultValue: [] },
  expiresAt: { type: DataTypes.DATE },
}, { tableName: 'carts', underscored: true });

// ── ASSOCIATIONS ─────────────────────────────────────────────
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });
OrderItem.belongsTo(Product, { foreignKey: 'productId' });
Order.hasOne(Payment, { foreignKey: 'orderId' });
Payment.belongsTo(Order, { foreignKey: 'orderId' });
Order.hasOne(Prescription, { foreignKey: 'orderId' });

// ── SYNC ─────────────────────────────────────────────────────
const syncDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✅ Tables synced');
  } catch (err) {
    console.error('❌ Database error:', err.message);
    // Don't crash — allow app to run without DB for testing
  }
};

module.exports = { sequelize, syncDB, User, Product, Order, OrderItem, Payment, Prescription, Cart };
