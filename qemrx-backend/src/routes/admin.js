const express = require('express');
const { Order, User, Payment, Prescription } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
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
    res.json({ totalOrders, todayOrders, pendingOrders, totalRevenue: totalRevenue || 0, pendingRx, totalUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
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
router.patch('/users/:id/role', async (req, res) => {
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

module.exports = router;
