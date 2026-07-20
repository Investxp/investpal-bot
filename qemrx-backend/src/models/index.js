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
  role: { type: DataTypes.ENUM('customer', 'pharmacist', 'delivery', 'admin'), defaultValue: 'customer' },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  lastLogin: { type: DataTypes.DATE },
  address: { type: DataTypes.TEXT },
  county: { type: DataTypes.STRING, defaultValue: 'Nairobi' },
}, { tableName: 'users', underscored: true });

const Product = sequelize.define('Product', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  brand: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING, allowNull: false },
  subcategory: { type: DataTypes.STRING },
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

// ── PROCUREMENT & SUPPLY ────────────────────────────────────
const Supplier = sequelize.define('Supplier', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  contactPerson: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  address: { type: DataTypes.TEXT },
  productsOffered: { type: DataTypes.TEXT },
  paymentTerms: { type: DataTypes.STRING },
  leadTimeDays: { type: DataTypes.INTEGER },
  rating: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'suppliers', underscored: true });

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  poNumber: { type: DataTypes.STRING, unique: true },
  supplierId: { type: DataTypes.UUID },
  status: { type: DataTypes.ENUM('draft','sent','approved','received','cancelled'), defaultValue: 'draft' },
  total: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  notes: { type: DataTypes.TEXT },
  orderedAt: { type: DataTypes.DATE },
  receivedAt: { type: DataTypes.DATE },
}, { tableName: 'purchase_orders', underscored: true });

const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  purchaseOrderId: { type: DataTypes.UUID },
  productName: { type: DataTypes.STRING },
  quantity: { type: DataTypes.INTEGER },
  unitPrice: { type: DataTypes.DECIMAL(10, 2) },
  total: { type: DataTypes.DECIMAL(10, 2) },
}, { tableName: 'purchase_order_items', underscored: true });

// ── ACCOUNTING & FINANCE ────────────────────────────────────
const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  type: { type: DataTypes.ENUM('income','expense','transfer'), allowNull: false },
  category: { type: DataTypes.STRING },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  description: { type: DataTypes.TEXT },
  reference: { type: DataTypes.STRING },
  paymentMethod: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('pending','completed','failed'), defaultValue: 'completed' },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'transactions', underscored: true });

const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  invoiceNumber: { type: DataTypes.STRING, unique: true },
  type: { type: DataTypes.ENUM('sales','purchase','expense'), allowNull: false },
  relatedId: { type: DataTypes.STRING },
  clientName: { type: DataTypes.STRING },
  amount: { type: DataTypes.DECIMAL(10, 2) },
  tax: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(10, 2) },
  status: { type: DataTypes.ENUM('draft','sent','paid','overdue','cancelled'), defaultValue: 'draft' },
  dueDate: { type: DataTypes.DATE },
  paidAt: { type: DataTypes.DATE },
}, { tableName: 'invoices', underscored: true });

// ── MARKETING & PROMOTIONS ──────────────────────────────────
const Campaign = sequelize.define('Campaign', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('email','sms','social','banner','referral','other'), defaultValue: 'social' },
  startDate: { type: DataTypes.DATE },
  endDate: { type: DataTypes.DATE },
  budget: { type: DataTypes.DECIMAL(10, 2) },
  spent: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  status: { type: DataTypes.ENUM('planning','active','paused','completed','cancelled'), defaultValue: 'planning' },
  description: { type: DataTypes.TEXT },
  metrics: { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'campaigns', underscored: true });

const Promotion = sequelize.define('Promotion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING, unique: true },
  type: { type: DataTypes.ENUM('percentage','fixed','free_shipping'), allowNull: false },
  value: { type: DataTypes.DECIMAL(10, 2) },
  minOrder: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  maxUses: { type: DataTypes.INTEGER },
  usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  startDate: { type: DataTypes.DATE },
  endDate: { type: DataTypes.DATE },
  description: { type: DataTypes.TEXT },
}, { tableName: 'promotions', underscored: true });

// ── PUBLIC RELATIONS ────────────────────────────────────────
const Inquiry = sequelize.define('Inquiry', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  subject: { type: DataTypes.STRING },
  message: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('new','read','replied','closed'), defaultValue: 'new' },
  response: { type: DataTypes.TEXT },
  respondedAt: { type: DataTypes.DATE },
  respondedBy: { type: DataTypes.UUID },
}, { tableName: 'inquiries', underscored: true });

const PressRelease = sequelize.define('PressRelease', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  content: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('draft','published','archived'), defaultValue: 'draft' },
  publishedAt: { type: DataTypes.DATE },
  publishedBy: { type: DataTypes.UUID },
}, { tableName: 'press_releases', underscored: true });

const Review = sequelize.define('Review', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  productId: { type: DataTypes.UUID },
  userId: { type: DataTypes.UUID },
  rating: { type: DataTypes.INTEGER },
  comment: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
}, { tableName: 'reviews', underscored: true });

// ── COMPLIANCE & LEGAL ──────────────────────────────────────
const License = sequelize.define('License', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  authority: { type: DataTypes.STRING },
  licenseNumber: { type: DataTypes.STRING },
  issueDate: { type: DataTypes.DATE },
  expiryDate: { type: DataTypes.DATE },
  status: { type: DataTypes.ENUM('active','expired','pending','revoked'), defaultValue: 'active' },
  documentUrl: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'licenses', underscored: true });

const ComplianceRecord = sequelize.define('ComplianceRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('compliant','non_compliant','pending_review','not_applicable'), defaultValue: 'pending_review' },
  reviewDate: { type: DataTypes.DATE },
  reviewedBy: { type: DataTypes.UUID },
  notes: { type: DataTypes.TEXT },
}, { tableName: 'compliance_records', underscored: true });

// ── ASSOCIATIONS ─────────────────────────────────────────────
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });
OrderItem.belongsTo(Product, { foreignKey: 'productId' });
Order.hasOne(Payment, { foreignKey: 'orderId' });
Payment.belongsTo(Order, { foreignKey: 'orderId' });
Order.hasOne(Prescription, { foreignKey: 'orderId' });
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'purchaseOrderId' });
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplierId' });
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplierId' });
Review.belongsTo(Product, { foreignKey: 'productId' });
Review.belongsTo(User, { foreignKey: 'userId' });

// ── SYNC ─────────────────────────────────────────────────────
const syncDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    await sequelize.sync({ alter: true });
    console.log('✅ Tables synced');
  } catch (err) {
    console.error('❌ Database error:', err.message);
  }
};

module.exports = { sequelize, syncDB, User, Product, Order, OrderItem, Payment, Prescription, Cart,
  Supplier, PurchaseOrder, PurchaseOrderItem, Transaction, Invoice,
  Campaign, Promotion, Inquiry, PressRelease, Review,
  License, ComplianceRecord };
