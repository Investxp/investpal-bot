const express = require('express');
const { Payment, Order } = require('../models');
const mpesa = require('../services/mpesa');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── M-PESA STK PUSH ─────────────────────────────────────────
// POST /api/payments/mpesa/stk
router.post('/mpesa/stk', auth, async (req, res) => {
  try {
    const { orderId, phone } = req.body;
    if (!orderId || !phone) return res.status(400).json({ error: 'orderId and phone required' });

    const order = await Order.findOne({ where: { id: orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'Order already paid' });

    let stkResult;
    const isDemo = process.env.MPESA_DEMO_MODE === 'true';

    if (isDemo) {
      const fakeId = 'DEMO-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      stkResult = {
        checkoutRequestId: fakeId,
        merchantRequestId: 'MR-' + fakeId,
        responseCode: '0',
        responseDescription: 'Success. Demo mode — no real STK sent.',
        customerMessage: 'Demo mode activated.',
        raw: { demo: true, fakeId },
      };
      console.log(`[M-Pesa DEMO] Simulated STK push → ${fakeId}`);
    } else {
      stkResult = await mpesa.initiateSTKPush(phone, parseFloat(order.total), order.id, `QEMRX Pharmacy ${order.orderNumber}`);
      if (stkResult.responseCode !== '0') {
        return res.status(400).json({ error: 'STK push failed', details: stkResult });
      }
    }

    await Payment.upsert({
      orderId: order.id,
      method: 'mpesa',
      amount: order.total,
      status: isDemo ? 'pending' : 'pending',
      mpesaCheckoutRequestId: stkResult.checkoutRequestId,
      mpesaMerchantRequestId: stkResult.merchantRequestId,
      mpesaPhone: mpesa.formatPhone(phone),
      rawResponse: stkResult.raw,
    });

    res.json({
      message: isDemo ? '🔬 DEMO: STK push simulated. Auto-confirming in 12s…' : 'STK push sent. Check your phone and enter M-Pesa PIN.',
      checkoutRequestId: stkResult.checkoutRequestId,
      customerMessage: stkResult.customerMessage,
    });
  } catch (err) {
    console.error('[M-Pesa STK]', err.message);
    res.status(500).json({ error: 'M-Pesa error: ' + err.message });
  }
});

// ── M-PESA STK CALLBACK (Safaricom posts here) ──────────────
// POST /api/payments/mpesa/callback
router.post('/mpesa/callback', async (req, res) => {
  // Respond immediately to Safaricom (required)
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const result = mpesa.parseSTKCallback(req.body);
    console.log('[M-Pesa Callback]', result);

    const payment = await Payment.findOne({
      where: { mpesaCheckoutRequestId: result.checkoutRequestId },
    });
    if (!payment) return console.warn('[M-Pesa] No matching payment found for', result.checkoutRequestId);

    if (result.success) {
      await payment.update({
        status: 'completed',
        mpesaReceiptNumber: result.mpesaReceiptNumber,
        paidAt: new Date(),
        rawResponse: { ...payment.rawResponse, callback: req.body },
      });
      // Mark order as paid & confirmed
      await Order.update(
        { paymentStatus: 'paid', status: 'confirmed' },
        { where: { id: payment.orderId } }
      );
      console.log(`[M-Pesa] Payment SUCCESS — Receipt: ${result.mpesaReceiptNumber}`);
    } else {
      await payment.update({
        status: 'failed',
        rawResponse: { ...payment.rawResponse, callback: req.body },
      });
      console.log(`[M-Pesa] Payment FAILED — Code: ${result.resultCode} ${result.resultDesc}`);
    }
  } catch (err) {
    console.error('[M-Pesa Callback Error]', err.message);
  }
});

// ── QUERY STK STATUS (polling endpoint for frontend) ─────────
// GET /api/payments/mpesa/status/:checkoutRequestId
router.get('/mpesa/status/:checkoutRequestId', auth, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      where: { mpesaCheckoutRequestId: req.params.checkoutRequestId },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    if (payment.status === 'pending') {
      const isDemo = process.env.MPESA_DEMO_MODE === 'true';
      if (isDemo && payment.mpesaCheckoutRequestId?.startsWith('DEMO-')) {
        const elapsed = Date.now() - new Date(payment.createdAt).getTime();
        if (elapsed > 12000) { // auto-confirm after 12 seconds
          await payment.update({ status: 'completed', mpesaReceiptNumber: 'DEMO-' + Date.now(), paidAt: new Date() });
          await Order.update({ paymentStatus: 'paid', status: 'confirmed' }, { where: { id: payment.orderId } });
          console.log(`[M-Pesa DEMO] Auto-confirmed payment ${payment.id} after ${elapsed}ms`);
        }
      } else {
        try {
          const status = await mpesa.queryStkStatus(req.params.checkoutRequestId);
          if (status.ResultCode === 0) {
            await payment.update({ status: 'completed', paidAt: new Date() });
            await Order.update({ paymentStatus: 'paid', status: 'confirmed' }, { where: { id: payment.orderId } });
          }
        } catch (_) {}
      }
    }

    res.json({ status: payment.status, receipt: payment.mpesaReceiptNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── B2C RESULT CALLBACK ──────────────────────────────────────
router.post('/mpesa/b2c/result', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  console.log('[B2C Result]', JSON.stringify(req.body, null, 2));
});

router.post('/mpesa/timeout', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  console.warn('[M-Pesa Timeout]', req.body);
});

// ── STRIPE PAYMENT INTENT ─────────────────────────────────────
// POST /api/payments/stripe/intent
router.post('/stripe/intent', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ where: { id: orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isDemo = process.env.MPESA_DEMO_MODE === 'true' || !process.env.STRIPE_SECRET_KEY;

    if (isDemo) {
      const fakeId = 'pi_demo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const fakeSecret = fakeId + '_secret_demo_' + Math.random().toString(36).slice(2, 15);
      await Payment.upsert({ orderId: order.id, method: 'card', amount: order.total, status: 'pending', stripePaymentIntentId: fakeId, stripeClientSecret: fakeSecret });
      return res.json({ clientSecret: fakeSecret, demo: true });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(order.total) * 100),
      currency: 'kes',
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });
    await Payment.upsert({ orderId: order.id, method: 'card', amount: order.total, status: 'pending', stripePaymentIntentId: intent.id, stripeClientSecret: intent.client_secret });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STRIPE WEBHOOK ────────────────────────────────────────────
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const isDemo = process.env.MPESA_DEMO_MODE === 'true' || !process.env.STRIPE_WEBHOOK_SECRET;
  if (isDemo) {
    try { const intentId = JSON.parse(req.body.toString())?.data?.object?.id; if (intentId) { const p = await Payment.findOne({ where: { stripePaymentIntentId: intentId } }); if (p) { await p.update({ status: 'completed', paidAt: new Date() }); await Order.update({ paymentStatus: 'paid', status: 'confirmed' }, { where: { id: p.orderId } }); } } } catch (_) {}
    return res.json({ received: true, demo: true });
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const payment = await Payment.findOne({ where: { stripePaymentIntentId: intent.id } });
    if (payment) {
      await payment.update({ status: 'completed', paidAt: new Date() });
      await Order.update({ paymentStatus: 'paid', status: 'confirmed' }, { where: { id: payment.orderId } });
    }
  }
  res.json({ received: true });
});

// ── CASH ON DELIVERY ─────────────────────────────────────────
// POST /api/payments/cash
router.post('/cash', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findOne({ where: { id: orderId, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await Payment.create({ orderId: order.id, method: 'cash', amount: order.total, status: 'pending' });
    await order.update({ paymentMethod: 'cash', status: 'confirmed' });

    res.json({ message: 'Cash on delivery confirmed. Pay your rider upon delivery.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
