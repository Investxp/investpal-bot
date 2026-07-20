const express = require('express');
const { Op } = require('sequelize');
const { Supplier, PurchaseOrder, PurchaseOrderItem, Transaction, Invoice,
  Campaign, Promotion, Inquiry, PressRelease, Review,
  License, ComplianceRecord, Product, User, Order } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(auth, adminOnly);

// ── SUPPLIERS ────────────────────────────────────────────────
router.get('/suppliers', async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) where[Op.or] = [{ name: { [Op.iLike]: `%${search}%` } }, { contactPerson: { [Op.iLike]: `%${search}%` } }];
    res.json(await Supplier.findAll({ where, order: [['name', 'ASC']] }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/suppliers', async (req, res) => {
  try { res.status(201).json(await Supplier.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/suppliers/:id', async (req, res) => {
  try { const s = await Supplier.findByPk(req.params.id); if (!s) return res.status(404).json({ error: 'Not found' }); await s.update(req.body); res.json(s); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── PURCHASE ORDERS ──────────────────────────────────────────
router.get('/purchase-orders', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const pos = await PurchaseOrder.findAll({ where, include: [{ model: Supplier }, { model: PurchaseOrderItem, as: 'items' }], order: [['createdAt', 'DESC']] });
    res.json(pos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/purchase-orders', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    if (!data.supplierId) return res.status(400).json({ error: 'Supplier required' });
    const po = await PurchaseOrder.create({ ...data, poNumber: 'PO-' + Date.now() });
    if (items && items.length) {
      const pois = items.map(i => ({ ...i, purchaseOrderId: po.id }));
      await PurchaseOrderItem.bulkCreate(pois);
    }
    const total = items ? items.reduce((s, i) => s + (parseFloat(i.unitPrice) || 0) * (i.quantity || 0), 0) : 0;
    await po.update({ total });
    const full = await PurchaseOrder.findByPk(po.id, { include: [{ model: Supplier }, { model: PurchaseOrderItem, as: 'items' }] });
    res.status(201).json(full);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/purchase-orders/:id', async (req, res) => {
  try { const po = await PurchaseOrder.findByPk(req.params.id); if (!po) return res.status(404).json({ error: 'Not found' }); await po.update(req.body); res.json(po); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── TRANSACTIONS (Finance) ───────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const { type, category, limit = 50 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (category) where.category = category;
    res.json(await Transaction.findAll({ where, order: [['date', 'DESC']], limit: parseInt(limit) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/transactions', async (req, res) => {
  try { res.status(201).json(await Transaction.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/transactions/summary', async (req, res) => {
  try {
    const income = await Transaction.sum('amount', { where: { type: 'income', status: 'completed' } }) || 0;
    const expenses = await Transaction.sum('amount', { where: { type: 'expense', status: 'completed' } }) || 0;
    const orderRevenue = await Order.sum('total') || 0;
    res.json({ totalIncome: income, totalExpenses: expenses, netProfit: income - expenses, orderRevenue });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INVOICES ─────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { status, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    res.json(await Invoice.findAll({ where, order: [['createdAt', 'DESC']] }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/invoices', async (req, res) => {
  try {
    const data = req.body;
    const total = parseFloat(data.amount || 0) + parseFloat(data.tax || 0);
    const inv = await Invoice.create({ ...data, invoiceNumber: 'INV-' + Date.now(), total });
    res.status(201).json(inv);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/invoices/:id', async (req, res) => {
  try { const i = await Invoice.findByPk(req.params.id); if (!i) return res.status(404).json({ error: 'Not found' }); await i.update(req.body); res.json(i); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── CAMPAIGNS ────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  try { res.json(await Campaign.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/campaigns', async (req, res) => {
  try { res.status(201).json(await Campaign.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/campaigns/:id', async (req, res) => {
  try { const c = await Campaign.findByPk(req.params.id); if (!c) return res.status(404).json({ error: 'Not found' }); await c.update(req.body); res.json(c); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── PROMOTIONS ───────────────────────────────────────────────
router.get('/promotions', async (req, res) => {
  try { res.json(await Promotion.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/promotions', async (req, res) => {
  try { res.status(201).json(await Promotion.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/promotions/:id', async (req, res) => {
  try { const p = await Promotion.findByPk(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); await p.update(req.body); res.json(p); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── INQUIRIES (PR) ───────────────────────────────────────────
router.get('/inquiries', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    res.json(await Inquiry.findAll({ where, order: [['createdAt', 'DESC']] }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/inquiries/:id', async (req, res) => {
  try {
    const i = await Inquiry.findByPk(req.params.id);
    if (!i) return res.status(404).json({ error: 'Not found' });
    await i.update({ ...req.body, respondedAt: req.body.status === 'replied' ? new Date() : i.respondedAt, respondedBy: req.user.id });
    res.json(i);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── PRESS RELEASES ───────────────────────────────────────────
router.get('/press-releases', async (req, res) => {
  try { res.json(await PressRelease.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/press-releases', async (req, res) => {
  try { res.status(201).json(await PressRelease.create({ ...req.body, publishedBy: req.user.id })); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/press-releases/:id', async (req, res) => {
  try { const p = await PressRelease.findByPk(req.params.id); if (!p) return res.status(404).json({ error: 'Not found' }); await p.update(req.body); res.json(p); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── REVIEWS ──────────────────────────────────────────────────
router.get('/reviews', async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    res.json(await Review.findAll({ where, include: [{ model: Product, attributes: ['name'] }, { model: User, attributes: ['name', 'phone'] }], order: [['createdAt', 'DESC']] }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/reviews/:id', async (req, res) => {
  try { const r = await Review.findByPk(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' }); await r.update(req.body); res.json(r); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── LICENSES ─────────────────────────────────────────────────
router.get('/licenses', async (req, res) => {
  try { res.json(await License.findAll({ order: [['expiryDate', 'ASC']] })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/licenses', async (req, res) => {
  try { res.status(201).json(await License.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/licenses/:id', async (req, res) => {
  try { const l = await License.findByPk(req.params.id); if (!l) return res.status(404).json({ error: 'Not found' }); await l.update(req.body); res.json(l); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── COMPLIANCE RECORDS ───────────────────────────────────────
router.get('/compliance', async (req, res) => {
  try { res.json(await ComplianceRecord.findAll({ order: [['createdAt', 'DESC']] })); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/compliance', async (req, res) => {
  try { res.status(201).json(await ComplianceRecord.create({ ...req.body, reviewedBy: req.user.id })); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/compliance/:id', async (req, res) => {
  try { const c = await ComplianceRecord.findByPk(req.params.id); if (!c) return res.status(404).json({ error: 'Not found' }); await c.update(req.body); res.json(c); } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
