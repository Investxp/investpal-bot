/**
 * QEMRX PHARMACY — M-Pesa Daraja API Service
 * Handles: STK Push, C2B callbacks, B2C refunds, transaction status
 *
 * Daraja docs: https://developer.safaricom.co.ke/docs
 */
const axios = require('axios');

const MPESA_BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// ── Get OAuth Token ─────────────────────────────────────────
async function getAccessToken() {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET } = process.env;
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error('M-Pesa credentials not configured in .env');
  }
  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get(
    `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return response.data.access_token;
}

// ── Generate Lipa Na M-Pesa Password ───────────────────────
function generatePassword() {
  const { MPESA_SHORTCODE, MPESA_PASSKEY } = process.env;
  const timestamp = getTimestamp();
  const raw = `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`;
  return {
    password: Buffer.from(raw).toString('base64'),
    timestamp,
  };
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
}

// ── Format Phone (must be 254XXXXXXXXX) ────────────────────
function formatPhone(phone) {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) return `254${clean.slice(1)}`;
  if (clean.startsWith('+')) return clean.slice(1);
  return clean;
}

// ── STK PUSH (Lipa Na M-Pesa Online) ───────────────────────
/**
 * Sends an STK push to the customer's phone.
 * @param {string} phone  - Customer phone e.g. 0712345678
 * @param {number} amount - Amount in KES (integers only)
 * @param {string} orderId - Your internal order reference
 * @param {string} description - Shown on customer's M-Pesa prompt
 */
async function initiateSTKPush(phone, amount, orderId, description = 'QEMRX Pharmacy Order') {
  const token = await getAccessToken();
  const { password, timestamp } = generatePassword();
  const formattedPhone = formatPhone(phone);
  const { MPESA_SHORTCODE, MPESA_CALLBACK_URL } = process.env;

  const payload = {
    BusinessShortCode: MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',  // Use 'CustomerBuyGoodsOnline' for Till
    Amount: Math.round(amount),
    PartyA: formattedPhone,
    PartyB: MPESA_SHORTCODE,
    PhoneNumber: formattedPhone,
    CallBackURL: `${MPESA_CALLBACK_URL}`,
    AccountReference: `QEMRX-${orderId.slice(0, 8).toUpperCase()}`,
    TransactionDesc: description.slice(0, 13),
  };

  console.log(`[M-Pesa] STK push → ${formattedPhone} KES ${amount} Order ${orderId}`);

  const response = await axios.post(
    `${MPESA_BASE}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  return {
    checkoutRequestId: response.data.CheckoutRequestID,
    merchantRequestId: response.data.MerchantRequestID,
    responseCode: response.data.ResponseCode,
    responseDescription: response.data.ResponseDescription,
    customerMessage: response.data.CustomerMessage,
    raw: response.data,
  };
}

// ── QUERY STK PUSH STATUS ───────────────────────────────────
async function queryStkStatus(checkoutRequestId) {
  const token = await getAccessToken();
  const { password, timestamp } = generatePassword();
  const response = await axios.post(
    `${MPESA_BASE}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return response.data;
}

// ── PARSE STK CALLBACK ──────────────────────────────────────
/**
 * Parse the callback Safaricom POSTs to your MPESA_CALLBACK_URL
 * Returns structured result you can persist to Payment table
 */
function parseSTKCallback(body) {
  const { Body } = body;
  const { stkCallback } = Body;
  const resultCode = stkCallback.ResultCode;
  const success = resultCode === 0;

  if (!success) {
    return {
      success: false,
      resultCode,
      resultDesc: stkCallback.ResultDesc,
      merchantRequestId: stkCallback.MerchantRequestID,
      checkoutRequestId: stkCallback.CheckoutRequestID,
    };
  }

  const items = stkCallback.CallbackMetadata?.Item || [];
  const get = (name) => items.find(i => i.Name === name)?.Value;

  return {
    success: true,
    resultCode,
    resultDesc: stkCallback.ResultDesc,
    merchantRequestId: stkCallback.MerchantRequestID,
    checkoutRequestId: stkCallback.CheckoutRequestID,
    amount: get('Amount'),
    mpesaReceiptNumber: get('MpesaReceiptNumber'),
    transactionDate: get('TransactionDate'),
    phoneNumber: get('PhoneNumber')?.toString(),
  };
}

// ── B2C REFUND (Business to Customer) ──────────────────────
async function initiateRefund(phone, amount, orderId, reason = 'Order refund') {
  const token = await getAccessToken();
  const formattedPhone = formatPhone(phone);
  const { MPESA_SHORTCODE } = process.env;

  const response = await axios.post(
    `${MPESA_BASE}/mpesa/b2c/v3/paymentrequest`,
    {
      OriginatorConversationID: `QEMRX-REFUND-${orderId}`,
      InitiatorName: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.round(amount),
      PartyA: MPESA_SHORTCODE,
      PartyB: formattedPhone,
      Remarks: reason,
      QueueTimeOutURL: `${process.env.BASE_URL}/api/payments/mpesa/timeout`,
      ResultURL: `${process.env.BASE_URL}/api/payments/mpesa/b2c/result`,
      Occasion: `QEMRX-${orderId.slice(0, 8).toUpperCase()}`,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return response.data;
}

module.exports = {
  getAccessToken,
  initiateSTKPush,
  queryStkStatus,
  parseSTKCallback,
  initiateRefund,
  formatPhone,
};
