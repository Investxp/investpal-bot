const express = require('express');
const { Op } = require('sequelize');
const { Product } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/products — list with search, filter, pagination
router.get('/', async (req, res) => {
  try {
    const {
      search, category, type, sort = 'name',
      order = 'ASC', page = 1, limit = 24,
      minPrice, maxPrice,
    } = req.query;

    const where = { isActive: true };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (category) where.category = category;
    if (type) where.type = type;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = minPrice;
      if (maxPrice) where.price[Op.lte] = maxPrice;
    }

    const validSorts = ['name', 'price', 'createdAt'];
    const sortField = validSorts.includes(sort) ? sort : 'name';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Product.findAndCountAll({
      where,
      order: [[sortField, order.toUpperCase()]],
      limit: Math.min(parseInt(limit), 100),
      offset,
    });

    res.json({
      products: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await Product.findAll({
      attributes: ['category'],
      group: ['category'],
      where: { isActive: true },
    });
    res.json(cats.map(c => c.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product || !product.isActive)
      return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products — admin only
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/products/:id — admin only
router.patch('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await product.update(req.body);
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/products/:id — soft delete
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await product.update({ isActive: false });
    res.json({ message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
