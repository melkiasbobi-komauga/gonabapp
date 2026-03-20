require('dotenv').config();
const { Pool } = require('pg');

// ============================================================
// PostgreSQL Connection Pool
// ============================================================
const pool = new Pool({
  host:             process.env.DB_HOST              || 'localhost',
  port:             parseInt(process.env.DB_PORT     || '5432'),
  database:         process.env.DB_NAME              || 'gonab_db',
  user:             process.env.DB_USER              || 'gonab_user',
  password:         process.env.DB_PASSWORD          || 'gonab2024secure',
  min:              parseInt(process.env.DB_POOL_MIN || '2'),
  max:              parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis:parseInt(process.env.DB_IDLE_TIMEOUT       || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
  // PostGIS type parsing — return geography sebagai string WKT
  types: (() => {
    const types = require('pg').types;
    // Biarkan geometry/geography dikembalikan sebagai string
    return types;
  })()
});

// Test koneksi saat startup
pool.on('connect', () => {
  // Aktifkan PostGIS untuk setiap koneksi baru
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ============================================================
// Fungsi query utama
// ============================================================
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 200) {
      console.log(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    console.error('[DB] Query:', text.substring(0, 120));
    throw err;
  }
};

// Transaction helper
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Health check koneksi
const checkConnection = async () => {
  try {
    const { rows } = await query(
      "SELECT version(), NOW() AS server_time, PostGIS_Version() AS postgis_version"
    );
    return {
      connected: true,
      postgres: rows[0].version.split(' ').slice(0,2).join(' '),
      postgis:  rows[0].postgis_version,
      server_time: rows[0].server_time
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
};

const testConnection = checkConnection; // alias

module.exports = { pool, query, withTransaction, checkConnection, testConnection };
