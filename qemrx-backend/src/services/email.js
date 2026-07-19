const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'apikey',
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendOrderConfirmation(user, order, items) {
  if (!process.env.SMTP_PASS) {
    console.warn('[Email] SMTP_PASS not set — skipping confirmation email');
    return;
  }

  const itemsHtml = items.map(i =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${i.productName}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">KES ${parseFloat(i.subtotal).toLocaleString()}</td>
    </tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Inter,Arial,sans-serif;background:#f7faf9;margin:0;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,107,94,0.1)">
        <div style="background:#006B5E;padding:28px 32px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">💊 QEMRX PHARMACY</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">Order Confirmed!</p>
        </div>
        <div style="padding:32px">
          <p style="color:#0d1f1c;font-size:16px">Hi ${user.name},</p>
          <p style="color:#5c7a75;font-size:14px;line-height:1.6">
            Thank you for your order. We've received it and our pharmacists are processing it now.
          </p>

          <div style="background:#eef5f3;border-radius:8px;padding:16px 20px;margin:20px 0">
            <p style="margin:0;font-size:13px;color:#5c7a75">Order Number</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#006B5E">${order.orderNumber}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px 0;border-bottom:2px solid #006B5E;color:#006B5E">Item</th>
                <th style="text-align:center;padding:8px 0;border-bottom:2px solid #006B5E;color:#006B5E">Qty</th>
                <th style="text-align:right;padding:8px 0;border-bottom:2px solid #006B5E;color:#006B5E">Amount</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding:12px 0 4px;font-size:13px;color:#5c7a75">Delivery</td>
                <td style="padding:12px 0 4px;text-align:right;font-size:13px;color:#5c7a75">KES ${parseFloat(order.deliveryFee).toLocaleString()}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:4px 0;font-weight:700;font-size:16px">Total</td>
                <td style="padding:4px 0;text-align:right;font-weight:700;font-size:16px;color:#006B5E">KES ${parseFloat(order.total).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>

          <div style="margin:24px 0;padding:16px;border:1.5px solid #d4e6e1;border-radius:8px">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0d1f1c">📦 Delivery Details</p>
            <p style="margin:0;font-size:13px;color:#5c7a75">${order.deliveryAddress}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#5c7a75">📱 ${order.deliveryPhone}</p>
            ${order.estimatedDelivery ? `<p style="margin:4px 0 0;font-size:13px;color:#006B5E;font-weight:600">ETA: ${new Date(order.estimatedDelivery).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</p>` : ''}
          </div>

          <p style="font-size:13px;color:#5c7a75;line-height:1.6">
            Need help? Call us on <a href="tel:${process.env.PHARMACY_PHONE}" style="color:#006B5E">${process.env.PHARMACY_PHONE}</a>
            or reply to this email.
          </p>
        </div>
        <div style="background:#eef5f3;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#5c7a75">${process.env.PHARMACY_NAME} · PPB Licensed · ${process.env.PHARMACY_ADDRESS}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `"QEMRX Pharmacy" <noreply@qemrxpharmacy.co.ke>`,
    to: user.email || `${user.phone}@sms.placeholder`,
    subject: `✅ Order Confirmed — ${order.orderNumber} | QEMRX Pharmacy`,
    html,
  });

  console.log(`[Email] Confirmation sent for ${order.orderNumber}`);
}

async function sendPrescriptionUpdate(phone, email, patientName, status, notes) {
  if (!process.env.SMTP_PASS || !email) return;

  const messages = {
    approved: 'Your prescription has been approved by our pharmacist. You can now complete your order.',
    rejected: `Your prescription could not be approved. Pharmacist notes: ${notes || 'Please contact us for details.'}`,
    reviewing: 'Our pharmacist is currently reviewing your prescription. We\'ll update you shortly.',
  };

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `📋 Prescription ${status.charAt(0).toUpperCase() + status.slice(1)} — QEMRX Pharmacy`,
    html: `<p>Hi ${patientName},</p><p>${messages[status] || 'Your prescription status has been updated.'}</p>
           <p>Call us: <a href="tel:${process.env.PHARMACY_PHONE}">${process.env.PHARMACY_PHONE}</a></p>`,
  });
}

module.exports = { sendOrderConfirmation, sendPrescriptionUpdate };
