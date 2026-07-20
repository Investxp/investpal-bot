/**
 * QEMRX PHARMACY — Database Seed
 * ─────────────────────────────────────────────────────────
 * 199 products benchmarked against MyDawa.com
 * 13 categories matching MyDawa taxonomy
 *
 * Usage: npm run seed
 */
require('dotenv').config();
const { sequelize, Product, User } = require('./src/models');
const bcrypt = require('bcryptjs');

// ── 199 PRODUCTS — imported from seed_data.js ─────────────
const products = require('./seed_data');

// ── SEED FUNCTION ─────────────────────────────────────────
async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    await sequelize.sync({ alter: false });
    console.log('✅ Tables synced\n');

    // ── Seed Products ──────────────────────────────────────
    console.log('📦 Seeding products...');
    let created = 0, skipped = 0;

    for (const p of products) {
      const [, wasCreated] = await Product.findOrCreate({
        where: { name: p.name, brand: p.brand },
        defaults: p,
      });
      if (wasCreated) created++;
      else skipped++;
    }

    console.log(`   ✅ ${created} products created`);
    console.log(`   ⏭  ${skipped} already existed`);
    console.log(`   📊 Total: ${created + skipped} products in DB\n`);

    // ── Print category summary ─────────────────────────────
    const cats = {};
    products.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    console.log('📂 Categories:');
    Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
      console.log(`   ${cat.padEnd(35)} ${count} products`);
    });
    console.log('');

    // ── Seed Admin User ────────────────────────────────────
    const adminPass = await bcrypt.hash(
      process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@QEMRX2024!',
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    const [admin, adminCreated] = await User.findOrCreate({
      where: { phone: process.env.PHARMACY_PHONE || '+254700000000' },
      defaults: {
        name:      process.env.PHARMACY_NAME  || 'QEMRX Admin',
        email:     process.env.ADMIN_EMAIL    || 'admin@qemrxpharmacy.co.ke',
        phone:     process.env.PHARMACY_PHONE || '+254700000000',
        password:  adminPass,
        role:      'admin',
        isVerified: true,
      },
    });

    console.log(`👤 Admin user: ${adminCreated ? '✅ Created' : '⏭  Already exists'}`);
    console.log(`   Phone: ${admin.phone}`);
    console.log(`   Role : ${admin.role}\n`);

    // ── Seed Pharmacist User ───────────────────────────────
    const pharmPass = await bcrypt.hash('Pharmacist@2024!', 12);
    const [, pharmCreated] = await User.findOrCreate({
      where: { phone: '+254711000001' },
      defaults: {
        name:      'Lead Pharmacist',
        email:     'pharmacist@qemrxpharmacy.co.ke',
        phone:     '+254711000001',
        password:  pharmPass,
        role:      'pharmacist',
        isVerified: true,
      },
    });
    console.log(`💊 Pharmacist user: ${pharmCreated ? '✅ Created' : '⏭  Already exists'}`);

    console.log('\n🌱 Seed complete!\n');
    console.log('─────────────────────────────────────────────────');
    console.log('Admin login:');
    console.log(`  Phone   : ${process.env.PHARMACY_PHONE || '+254700000000'}`);
    console.log(`  Password: ${process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@QEMRX2024!'}`);
    console.log('  ⚠️  Change password immediately after first login!');
    console.log('─────────────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    if (process.env.NODE_ENV === 'development') console.error(err.stack);
    process.exit(1);
  }
}

seed();
