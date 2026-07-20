const express = require('express');
const { Order, User, Product, Payment, Prescription } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { Op, fn, col, literal } = require('sequelize');

// ── ADMIN ROUTER ─────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(auth, adminOnly);

// GET /api/admin/dashboard
adminRouter.get('/dashboard', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [totalOrders, todayOrders, pendingOrders, totalRevenue, pendingRx, totalUsers] = await Promise.all([
      Order.count(),
      Order.count({ where: { createdAt: { [Op.gte]: today } } }),
      Order.count({ where: { status: 'pending' } }),
      Payment.sum('amount', { where: { status: 'completed' } }),
      Prescription.count({ where: { status: 'pending' } }),
      User.count({ where: { role: 'customer' } }),
    ]);
    res.json({
      totalOrders, todayOrders, pendingOrders,
      totalRevenue: totalRevenue || 0,
      pendingRx, totalUsers,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
adminRouter.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = status ? { status } : {};
    const orders = await Order.findAndCountAll({
      where,
      include: [{ model: User, attributes: ['name', 'phone'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — list all employees (admin/pharmacist/delivery)
adminRouter.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query;
    const where = { role: { [Op.ne]: 'customer' } };
    if (role) where.role = role;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    const employees = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
    });
    // Attach performance metrics
    const enhanced = await Promise.all(employees.map(async (emp) => {
      const empData = emp.toJSON();
      empData.metrics = {
        ordersProcessed: await Order.count({ where: { status: 'delivered' } }),
        prescriptionsReviewed: await Prescription.count({ where: { reviewedBy: emp.id } }),
        lastLogin: emp.lastLogin,
      };
      return empData;
    }));
    res.json(enhanced);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users — create employee account
adminRouter.post('/users', async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'name, phone and password required' });
    if (!['pharmacist', 'delivery', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const exists = await User.findOne({ where: { phone } });
    if (exists) return res.status(409).json({ error: 'Phone already registered' });
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phone, email, password: hashed, role, isVerified: true });
    res.status(201).json({ id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id — update employee (role, isActive, name, phone)
adminRouter.patch('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { name, phone, email, role, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (role !== undefined && ['pharmacist', 'delivery', 'admin'].includes(role)) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    await user.update(updates);
    const { password, ...safe } = user.toJSON();
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELIVERY ROUTER ──────────────────────────────────────────
const deliveryRouter = express.Router();

// GET /api/delivery/fee?subtotal=xxx&county=xxx
deliveryRouter.get('/fee', (req, res) => {
  const subtotal = parseFloat(req.query.subtotal || 0);
  const county = req.query.county || 'Nairobi';
  const threshold = parseFloat(process.env.FREE_DELIVERY_THRESHOLD || 2500);

  if (subtotal >= threshold) return res.json({ fee: 0, reason: 'Free delivery on orders above KES ' + threshold });

  const fee = county.toLowerCase() === 'nairobi'
    ? parseFloat(process.env.DELIVERY_FEE_NAIROBI || 150)
    : parseFloat(process.env.DELIVERY_FEE_COUNTY || 300);

  res.json({
    fee,
    county,
    estimatedHours: process.env.ESTIMATED_DELIVERY_HOURS || 4,
    freeDeliveryThreshold: threshold,
  });
});

// GET /api/delivery/zones
deliveryRouter.get('/zones', (req, res) => {
  res.json({
    zones: [
      { name: 'Nairobi CBD & Westlands', fee: 150, eta: '2-4 hours' },
      { name: 'Nairobi Suburbs (Karen, Runda, Gigiri)', fee: 150, eta: '3-5 hours' },
      { name: 'Nairobi Outskirts (Ruiru, Kiambu, Rongai)', fee: 200, eta: '4-6 hours' },
      { name: 'Other Counties', fee: 300, eta: '1-2 days' },
    ],
    freeDeliveryThreshold: process.env.FREE_DELIVERY_THRESHOLD || 2500,
  });
});

module.exports = { adminRouter, deliveryRouter };
