const express = require('express');
const router = express.Router();

// GET /api/delivery/fee?subtotal=xxx&county=xxx
router.get('/fee', (req, res) => {
  const subtotal = parseFloat(req.query.subtotal || 0);
  const county = req.query.county || 'Nairobi';
  const threshold = parseFloat(process.env.FREE_DELIVERY_THRESHOLD || 2500);

  if (subtotal >= threshold)
    return res.json({ fee: 0, reason: `Free delivery on orders above KES ${threshold}` });

  const fee = county.toLowerCase() === 'nairobi'
    ? parseFloat(process.env.DELIVERY_FEE_NAIROBI || 150)
    : parseFloat(process.env.DELIVERY_FEE_COUNTY || 300);

  res.json({ fee, county, estimatedHours: process.env.ESTIMATED_DELIVERY_HOURS || 4, freeDeliveryThreshold: threshold });
});

// GET /api/delivery/zones
router.get('/zones', (req, res) => {
  res.json({
    zones: [
      { name: 'Nairobi CBD & Westlands',               fee: 150, eta: '2-4 hours' },
      { name: 'Nairobi Suburbs (Karen, Runda, Gigiri)', fee: 150, eta: '3-5 hours' },
      { name: 'Nairobi Outskirts (Ruiru, Kiambu)',      fee: 200, eta: '4-6 hours' },
      { name: 'Other Counties',                         fee: 300, eta: '1-2 days'  },
    ],
    freeDeliveryThreshold: process.env.FREE_DELIVERY_THRESHOLD || 2500,
  });
});

module.exports = router;
