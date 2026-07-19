const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Order, OrderItem, Product, Payment } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();

function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `QEMRX-${date}-${rand}`;
}

// POST /api/orders — create order
router.post('/', auth, async (req, res) => {
  try {
    const { items, deliveryAddress, deliveryPhone, deliveryNotes, paymentMethod } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'No items in order' });
    if (!deliveryAddress || !deliveryPhone) return res.status(400).json({ error: 'Delivery details required' });

    // Validate & price items
    const orderItems = [];
    let subtotal = 0;
    let requiresRx = false;

    for (const item of items) {
      const product = await Product.findByPk(item.productId);
      if (!product || !product.isActive)
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      if (product.stock !== null && product.stock < item.quantity)
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      if (product.type === 'rx') requiresRx = true;

      const lineTotal = parseFloat(product.price) * item.quantity;
      subtotal += lineTotal;
      orderItems.push({ productId: product.id, productName: product.name, quantity: item.quantity, unitPrice: product.price, subtotal: lineTotal });
    }

    const deliveryFee = subtotal >= parseFloat(process.env.FREE_DELIVERY_THRESHOLD || 2500) ? 0 : parseFloat(process.env.DELIVERY_FEE_NAIROBI || 150);
    const total = subtotal + deliveryFee;

    const deliveryHours = parseInt(process.env.ESTIMATED_DELIVERY_HOURS || 4);
    const estimatedDelivery = new Date(Date.now() + deliveryHours * 3600000);

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: req.user.id,
      status: 'pending',
      subtotal,
      deliveryFee,
      total,
      paymentMethod: paymentMethod || 'mpesa',
      deliveryAddress,
      deliveryPhone,
      deliveryNotes,
      estimatedDelivery,
      requiresPrescription: requiresRx,
    });

    // Create order items
    await OrderItem.bulkCreate(orderItems.map(i => ({ ...i, orderId: order.id })));

    // Decrement stock
    for (const item of items) {
      await Product.decrement('stock', { by: item.quantity, where: { id: item.productId } });
    }

    // Send confirmation email/SMS
    try {
      await emailService.sendOrderConfirmation(req.user, order, orderItems);
    } catch (e) {
      console.warn('[Email] Failed to send confirmation:', e.message);
    }

    const fullOrder = await Order.findByPk(order.id, { include: [{ model: OrderItem, as: 'items' }] });
    res.status(201).json({ order: fullOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders — my orders
router.get('/', auth, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.user.id },
      include: [{ model: OrderItem, as: 'items' }, { model: Payment }],
      order: [['createdAt', 'DESC']],
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: [{ model: OrderItem, as: 'items' }, { model: Payment }],
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/track/:orderNumber — track by order number (no auth needed)
router.get('/track/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { orderNumber: req.params.orderNumber },
      attributes: ['id', 'orderNumber', 'status', 'estimatedDelivery', 'createdAt', 'deliveryPhone'],
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/orders/:id/status — admin only
router.patch('/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ error: 'Invalid status' });

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await order.update({ status });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/cancel
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['pending', 'confirmed'].includes(order.status))
      return res.status(400).json({ error: 'Order cannot be cancelled at this stage' });
    await order.update({ status: 'cancelled' });
    res.json({ message: 'Order cancelled', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
