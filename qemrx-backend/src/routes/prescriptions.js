const express = require('express');
const multer = require('multer');
const path = require('path');
const { Prescription } = require('../models');
const { auth, adminOnly, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ── File Upload Config ───────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads/prescriptions');
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `rx-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only JPG, PNG and PDF files are allowed'));
  },
});

// POST /api/prescriptions — upload
router.post('/', optionalAuth, upload.single('prescription'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Prescription file required' });

    const { patientName, phone, notes } = req.body;
    if (!patientName || !phone) return res.status(400).json({ error: 'Patient name and phone required' });

    const fileUrl = `/uploads/prescriptions/${req.file.filename}`;
    const rx = await Prescription.create({
      userId: req.user?.id || null,
      patientName,
      phone,
      notes,
      fileUrl,
      fileName: req.file.originalname,
      status: 'pending',
    });

    res.status(201).json({
      message: 'Prescription uploaded. A pharmacist will review it within 30 minutes.',
      prescription: { id: rx.id, status: rx.status, patientName: rx.patientName },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prescriptions — my prescriptions
router.get('/', auth, async (req, res) => {
  try {
    const rxs = await Prescription.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(rxs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prescriptions/all — admin: all pending prescriptions
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const rxs = await Prescription.findAll({ where, order: [['createdAt', 'DESC']] });
    res.json(rxs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/prescriptions/:id/review — pharmacist review
router.patch('/:id/review', auth, adminOnly, async (req, res) => {
  try {
    const { status, pharmacistNotes } = req.body;
    const rx = await Prescription.findByPk(req.params.id);
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    await rx.update({ status, pharmacistNotes, reviewedBy: req.user.id });
    res.json(rx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 5MB.' });
  res.status(400).json({ error: err.message });
});

module.exports = router;
