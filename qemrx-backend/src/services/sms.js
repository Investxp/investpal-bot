/**
 * QEMRX PHARMACY — SMS Service via Africa's Talking
 * Docs: https://developers.africastalking.com/docs/sms
 */
const axios = require('axios');

const AT_BASE = 'https://api.africastalking.com/version1';
const AT_SANDBOX = 'https://api.sandbox.africastalking.com/version1';

function getBase() {
  return process.env.AT_USERNAME === 'sandbox' ? AT_SANDBOX : AT_BASE;
}

async function sendSMS(to, message) {
  const { AT_API_KEY, AT_USERNAME, AT_SENDER_ID } = process.env;
  if (!AT_API_KEY || !AT_USERNAME) {
    console.warn('[SMS] Africa\'s Talking not configured — skipping SMS');
    return null;
  }

  // Format phone number
  let phone = to.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `+254${phone.slice(1)}`;
  else if (!phone.startsWith('+')) phone = `+${phone}`;

  const params = new URLSearchParams({
    username: AT_USERNAME,
    to: phone,
    message,
    ...(AT_SENDER_ID && { from: AT_SENDER_ID }),
  });

  try {
    const response = await axios.post(`${getBase()}/messaging`, params.toString(), {
      headers: {
        apiKey: AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const result = response.data?.SMSMessageData?.Recipients?.[0];
    console.log(`[SMS] Sent to ${phone}: ${result?.status}`);
    return result;
  } catch (err) {
    console.error('[SMS Error]', err.response?.data || err.message);
    return null;
  }
}

// Pre-built message templates
const templates = {
  orderConfirmed: (orderNumber, total, eta) =>
    `QEMRX PHARMACY: Order ${orderNumber} confirmed! KES ${total} - ETA ${eta}. Track: ${process.env.BASE_URL}/track/${orderNumber}. Helpline: ${process.env.PHARMACY_PHONE}`,

  orderOutForDelivery: (orderNumber, riderName, riderPhone) =>
    `QEMRX PHARMACY: Your order ${orderNumber} is on the way! Rider: ${riderName || 'Our rider'} ${riderPhone ? `(${riderPhone})` : ''}. Expected in ~30 mins.`,

  orderDelivered: (orderNumber) =>
    `QEMRX PHARMACY: Order ${orderNumber} delivered! Thank you for choosing us. For refills call ${process.env.PHARMACY_PHONE}`,

  paymentReceived: (orderNumber, amount, receipt) =>
    `QEMRX PHARMACY: Payment of KES ${amount} received for order ${orderNumber}. M-Pesa receipt: ${receipt}. Thank you!`,

  prescriptionReceived: (patientName) =>
    `QEMRX PHARMACY: Hi ${patientName}, we received your prescription. Our pharmacist will review it within 30 mins. Call ${process.env.PHARMACY_PHONE}`,

  prescriptionApproved: (patientName) =>
    `QEMRX PHARMACY: Hi ${patientName}, your prescription has been approved! Visit ${process.env.BASE_URL} to complete your order.`,
};

module.exports = { sendSMS, templates };
