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

// PATCH /api/admin/users/:id/role
adminRouter.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await user.update({ role });
    res.json(user);
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
