-- ============================================================
-- GONAB - Minimal Schema for Testing (No PostGIS required)
-- ============================================================

-- ============================================================
-- 1. TABEL USERS (Pengguna & Admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150)  NOT NULL,
    phone           VARCHAR(20)   NOT NULL UNIQUE,
    email           VARCHAR(150)  UNIQUE,
    password        VARCHAR(255)  NOT NULL,
    role            VARCHAR(20)   NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer','driver','merchant','admin')),
    wallet_balance  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    avatar          TEXT,
    is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    otp_code        VARCHAR(10),
    otp_expires_at  TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone   ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active  ON users(is_active);

-- ============================================================
-- 2. TABEL DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type    VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('motor','mobil')),
    vehicle_plate   VARCHAR(20) NOT NULL UNIQUE,
    vehicle_model   VARCHAR(100),
    vehicle_color   VARCHAR(50),
    ktp_number      VARCHAR(20),
    sim_number      VARCHAR(20),
    stnk_number     VARCHAR(30),
    location        POINT,
    heading         NUMERIC(5,2) DEFAULT 0,
    speed           NUMERIC(6,2) DEFAULT 0,
    is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES users(id),
    is_online       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_available    BOOLEAN       NOT NULL DEFAULT TRUE,
    rating          NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
    total_trips     INTEGER       NOT NULL DEFAULT 0,
    total_earnings  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    location_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_user_id   ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_online    ON drivers(is_online, is_available, is_verified);
CREATE INDEX IF NOT EXISTS idx_drivers_vehicle   ON drivers(vehicle_type);

-- ============================================================
-- 3. TABEL MERCHANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_name          VARCHAR(200) NOT NULL,
    store_description   TEXT,
    store_category      VARCHAR(100),
    store_address       TEXT,
    location            POINT,
    phone               VARCHAR(20),
    operating_hours     VARCHAR(50),
    is_open             BOOLEAN       NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN       NOT NULL DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID REFERENCES users(id),
    rating              NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
    total_orders        INTEGER       NOT NULL DEFAULT 0,
    total_revenue       NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_user_id   ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_verified  ON merchants(is_verified);

-- ============================================================
-- 4. TABEL PRODUCTS & ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100)  NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES categories(id),
    name            VARCHAR(200)  NOT NULL,
    description     TEXT,
    price           NUMERIC(15,2) NOT NULL,
    image           TEXT,
    is_available    BOOLEAN       NOT NULL DEFAULT TRUE,
    stock           INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ============================================================
-- 5. ORDERS & ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    driver_id       UUID REFERENCES drivers(id),
    merchant_id     UUID REFERENCES merchants(id),
    service_type    VARCHAR(50),  -- GooRide, GooKurir, GooShop, etc
    status          VARCHAR(50)   NOT NULL DEFAULT 'searching' 
                    CHECK (status IN ('searching','pending','accepted','on_the_way','completed','cancelled','rejected')),
    pickup_point    POINT,
    destination_point POINT,
    total_amount    NUMERIC(15,2) NOT NULL,
    service_fee     NUMERIC(15,2) DEFAULT 0,
    payment_status  VARCHAR(20)   DEFAULT 'pending',
    notes           TEXT,
    sos_activated   BOOLEAN       DEFAULT FALSE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id),
    quantity        INTEGER NOT NULL,
    unit_price      NUMERIC(15,2) NOT NULL,
    subtotal        NUMERIC(15,2) NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. TARIFFS
-- ============================================================
CREATE TABLE IF NOT EXISTS tariffs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_type    VARCHAR(50)   NOT NULL UNIQUE,
    vehicle_type    VARCHAR(50),
    base_fare       NUMERIC(15,2) NOT NULL DEFAULT 0,
    per_km_fare     NUMERIC(15,2) NOT NULL DEFAULT 0,
    platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. WALLET & TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    amount          NUMERIC(15,2) NOT NULL,
    tx_type         VARCHAR(50)   NOT NULL, -- 'topup', 'payment', 'refund'
    description     TEXT,
    reference_id    VARCHAR(100),
    status          VARCHAR(50)   DEFAULT 'completed',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id);

-- ============================================================
-- 8. RENTALS
-- ============================================================
CREATE TABLE IF NOT EXISTS rentals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    vehicle_name    VARCHAR(100)  NOT NULL,
    vehicle_type    VARCHAR(50),
    location        POINT,
    hourly_rate     NUMERIC(15,2) NOT NULL,
    status          VARCHAR(50)   NOT NULL DEFAULT 'available',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. SOS ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS sos_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    order_id        UUID REFERENCES orders(id),
    situation       TEXT NOT NULL,
    sos_location    POINT,
    responder_id    UUID REFERENCES users(id),
    status          VARCHAR(50)   NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. ADMIN LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(255)  NOT NULL,
    details         TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. TRIGGER FOR updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_drivers_updated_at    BEFORE UPDATE ON drivers    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_merchants_updated_at  BEFORE UPDATE ON merchants  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_orders_updated_at     BEFORE UPDATE ON orders     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_tariffs_updated_at    BEFORE UPDATE ON tariffs    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_rentals_updated_at    BEFORE UPDATE ON rentals    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_sos_updated_at        BEFORE UPDATE ON sos_alerts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
