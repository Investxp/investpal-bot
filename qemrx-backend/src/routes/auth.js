const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { auth } = require('../middleware/auth');

const router = express.Router();

const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !phone || !password)
      return res.status(400).json({ error: 'name, phone and password are required' });

    const exists = await User.findOne({ where: { phone } });
    if (exists) return res.status(409).json({ error: 'Phone number already registered' });

    const hashed = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const user = await User.create({ name, email, phone, password: hashed });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: 'phone and password required' });

    const user = await User.findOne({ where: { phone } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await user.update({ lastLogin: new Date() });
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/profile
router.patch('/profile', auth, async (req, res) => {
  try {
    const { name, email, address, county } = req.body;
    await req.user.update({ name, email, address, county });
    res.json({ user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-admin — force reset admin password
router.post('/reset-admin', async (req, res) => {
  try {
    const expectedSecret = process.env.ADMIN_SECRET || 'qemrx-reset-2026';
    if (req.body.secret !== expectedSecret) return res.status(403).json({ error: 'Invalid secret' });
    const phone = req.body.phone || process.env.PHARMACY_PHONE || '+254736474493';
    const password = req.body.password || 'Admin@QEMRX2024!';
    const user = await User.findOne({ where: { phone } });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    const hashed = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    const newRole = user.role === 'admin' || user.role === 'pharmacist' ? user.role : 'admin';
    await user.update({ password: hashed, role: newRole });
    res.json({ message: `Password for ${phone} reset successfully (role: ${newRole})` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await user.update({ password: hashed });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
