require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'gonab_db',
  user:     process.env.DB_USER     || 'gonab_user',
  password: process.env.DB_PASSWORD || 'gonab2024secure',
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('\n🚀 GONAB - Menjalankan Migrasi Database PostgreSQL + PostGIS\n');

    // Buat tabel tracking migrasi
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const migDir = __dirname;
    const files = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Cek apakah sudah dijalankan
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1', [file]
      );
      if (rows.length > 0) {
        console.log(`   ⏩ Sudah dijalankan: ${file}`);
        continue;
      }

      console.log(`   ▶  Menjalankan: ${file} ...`);
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`   ✅ Selesai: ${file}`);
    }

    console.log('\n✅ Semua migrasi berhasil dijalankan!\n');

    // Verifikasi tabel
    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log('📋 Tabel yang tersedia:');
    tables.forEach(t => console.log(`   • ${t.tablename}`));

    // Verifikasi PostGIS
    const { rows: ext } = await client.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','uuid-ossp','pg_trgm')"
    );
    console.log('\n🗺️  Extensions aktif:');
    ext.forEach(e => console.log(`   • ${e.extname} v${e.extversion}`));

    // Cek seed data
    const { rows: stats } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users)     AS users,
        (SELECT COUNT(*) FROM drivers)   AS drivers,
        (SELECT COUNT(*) FROM merchants) AS merchants,
        (SELECT COUNT(*) FROM products)  AS products,
        (SELECT COUNT(*) FROM rentals)   AS rentals,
        (SELECT COUNT(*) FROM orders)    AS orders,
        (SELECT COUNT(*) FROM tariffs)   AS tariffs
    `);
    console.log('\n📊 Data terseed:');
    const s = stats[0];
    console.log(`   👥 Users: ${s.users}`);
    console.log(`   🚗 Drivers: ${s.drivers}`);
    console.log(`   🏪 Merchants: ${s.merchants}`);
    console.log(`   📦 Products: ${s.products}`);
    console.log(`   🏕️  Rentals: ${s.rentals}`);
    console.log(`   📋 Orders: ${s.orders}`);
    console.log(`   💰 Tariffs: ${s.tariffs}`);

    // Test PostGIS: cari driver terdekat dari pusat Nabire
    const { rows: nearby } = await client.query(
      'SELECT driver_name, vehicle_type, ROUND(distance_meters::numeric/1000,2) AS dist_km FROM find_nearby_drivers($1, $2, $3)',
      [-3.3640, 135.4960, 10000]
    );
    console.log('\n🗺️  Test PostGIS - Driver dalam 10km dari pusat Nabire:');
    nearby.forEach(d => console.log(`   🛵 ${d.driver_name} (${d.vehicle_type}) - ${d.dist_km} km`));

    console.log('\n🎉 Database GONAB siap digunakan!\n');
  } catch (err) {
    console.error('\n❌ Error migrasi:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error(err);
  process.exit(1);
});
