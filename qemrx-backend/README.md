# 💊 QEMRX PHARMACY — Backend

Node.js / Express backend for QEMRX Pharmacy with:
- **M-Pesa Daraja** STK Push (Lipa Na M-Pesa)
- **Stripe** card payments
- **Africa's Talking** SMS notifications
- **SendGrid** email confirmations
- **PostgreSQL** via Sequelize ORM
- Prescription upload & pharmacist review
- JWT auth, rate limiting, admin dashboard

---

## 🚀 Quick Start

### 1. Clone & install
```bash
git clone <your-repo>
cd qemrx-backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
nano .env   # fill in your credentials (see guide below)
```

### 3. Set up PostgreSQL
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt install postgresql postgresql-contrib

# Create database & user
sudo -u postgres psql
CREATE DATABASE qemrx_pharmacy;
CREATE USER qemrx_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE qemrx_pharmacy TO qemrx_user;
\q
```

### 4. Seed database (creates tables + loads 44 products + admin user)
```bash
npm run seed
```

### 5. Start server
```bash
npm run dev      # development (auto-restart)
npm start        # production
```

Server runs on `http://localhost:3000`
Health check: `GET /health`

---

## 🔑 .env Credential Guide

### M-Pesa (REQUIRED for payments)
1. Go to [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Create account → Create App → select **Lipa Na M-Pesa Sandbox**
3. Copy **Consumer Key** → `MPESA_CONSUMER_KEY`
4. Copy **Consumer Secret** → `MPESA_CONSUMER_SECRET`
5. Go to **APIs → Lipa Na M-Pesa Online** → copy **Passkey** → `MPESA_PASSKEY`
6. Use shortcode `174379` for sandbox testing
7. For callback: use [ngrok](https://ngrok.com) during development:
   ```bash
   ngrok http 3000
   # Copy https URL → set as BASE_URL in .env
   ```
8. Switch `MPESA_ENV=production` + use real credentials when going live

### Stripe (card payments)
1. [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys
2. Copy **Publishable key** → `STRIPE_PUBLIC_KEY`
3. Copy **Secret key** → `STRIPE_SECRET_KEY`
4. Webhooks → Add endpoint → `https://yourdomain.com/api/payments/stripe/webhook`
5. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Africa's Talking (SMS)
1. [africastalking.com](https://africastalking.com) → Create account
2. Go to **Settings → API Key** → copy → `AT_API_KEY`
3. Your username → `AT_USERNAME` (use `sandbox` for testing)
4. Register sender ID `QEMRX` → `AT_SENDER_ID`

### SendGrid (email)
1. [sendgrid.com](https://sendgrid.com) → Create account
2. **Settings → API Keys → Create** → Full Access
3. Copy → `SMTP_PASS` (it starts with `SG.`)
4. Verify your sender email in **Sender Authentication**

### Cloudinary (prescription image storage)
1. [cloudinary.com](https://cloudinary.com) → Create account
2. Dashboard → copy Cloud Name, API Key, API Secret

---

## 📡 API Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register new customer |
| POST | `/api/auth/login` | Login → returns JWT |
| GET  | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/profile` | Update profile |

### Products
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | List products (search, filter, paginate) |
| GET | `/api/products/categories` | All categories |
| GET | `/api/products/:id` | Single product |
| POST | `/api/products` | Create (admin) |
| PATCH | `/api/products/:id` | Update (admin) |

### Orders
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/orders` | Create order |
| GET | `/api/orders` | My orders |
| GET | `/api/orders/:id` | Order detail |
| GET | `/api/orders/track/:orderNumber` | Public tracking |
| POST | `/api/orders/:id/cancel` | Cancel order |

### Payments
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/payments/mpesa/stk` | Initiate M-Pesa STK push |
| POST | `/api/payments/mpesa/callback` | M-Pesa callback (Safaricom → server) |
| GET | `/api/payments/mpesa/status/:id` | Poll payment status |
| POST | `/api/payments/stripe/intent` | Create Stripe PaymentIntent |
| POST | `/api/payments/stripe/webhook` | Stripe webhook |
| POST | `/api/payments/cash` | Confirm cash on delivery |

### Prescriptions
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/prescriptions` | Upload prescription (multipart/form-data) |
| GET | `/api/prescriptions` | My prescriptions |
| GET | `/api/prescriptions/all` | All (pharmacist/admin) |
| PATCH | `/api/prescriptions/:id/review` | Approve/reject (pharmacist) |

### Admin
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/admin/dashboard` | Stats: orders, revenue, pending Rx |
| GET | `/api/admin/orders` | All orders (filterable) |
| PATCH | `/api/admin/users/:id/role` | Promote to pharmacist/admin |

### Delivery
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/delivery/fee?subtotal=&county=` | Calculate delivery fee |
| GET | `/api/delivery/zones` | Delivery zones & ETAs |

---

## 🔄 M-Pesa Payment Flow

```
Customer clicks "Pay with M-Pesa"
    ↓
POST /api/payments/mpesa/stk  { orderId, phone }
    ↓
Server calls Safaricom STK Push API
    ↓
Customer receives prompt on phone → enters PIN
    ↓
Safaricom POSTs result to /api/payments/mpesa/callback
    ↓
Server updates Payment.status = 'completed'
Server updates Order.paymentStatus = 'paid'
Server sends SMS + Email confirmation
```

---

## 📁 Project Structure

```
qemrx-backend/
├── src/
│   ├── server.js          # Entry point
│   ├── models/
│   │   └── index.js       # Sequelize models (User, Product, Order, Payment, Prescription, Cart)
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── orders.js
│   │   ├── payments.js    # M-Pesa + Stripe
│   │   ├── prescriptions.js
│   │   ├── cart.js
│   │   ├── admin.js
│   │   └── delivery.js
│   ├── middleware/
│   │   └── auth.js        # JWT middleware
│   └── services/
│       ├── mpesa.js       # Daraja API integration
│       ├── email.js       # Nodemailer / SendGrid
│       └── sms.js         # Africa's Talking
├── uploads/
│   └── prescriptions/     # Uploaded Rx files
├── seed.js                # Database seeder
├── .env.example           # Environment template
└── package.json
```

---

## 🚢 Production Deployment (Ubuntu VPS)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name qemrx-pharmacy
pm2 save
pm2 startup

# Nginx reverse proxy
sudo nano /etc/nginx/sites-available/qemrx
# Add: proxy_pass http://localhost:3000;

# SSL
sudo certbot --nginx -d yourdomain.co.ke
```

## 🌐 Expose locally for M-Pesa callback testing
```bash
npx ngrok http 3000
# Copy the https URL → paste as BASE_URL in .env
# Safaricom will POST to https://xxxx.ngrok.io/api/payments/mpesa/callback
```
