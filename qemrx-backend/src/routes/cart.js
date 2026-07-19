const express = require('express');
const { Cart } = require('../models');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.headers['x-session-id'];
    const key = userId ? { userId } : sessionId ? { sessionId } : null;
    if (!key) return res.json({ items: [] });
    const cart = await Cart.findOne({ where: key });
    res.json({ items: cart?.items || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', optionalAuth, async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user?.id;
    const sessionId = req.headers['x-session-id'];
    const key = userId ? { userId } : sessionId ? { sessionId } : null;
    if (!key) return res.status(400).json({ error: 'No session or user' });
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Cart.upsert({ ...key, items, expiresAt: expires });
    res.json({ items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.headers['x-session-id'];
    const key = userId ? { userId } : sessionId ? { sessionId } : null;
    if (key) await Cart.destroy({ where: key });
    res.json({ message: 'Cart cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
