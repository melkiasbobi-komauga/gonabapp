-- ============================================================
-- GONAB - Platform Digital Nabire, Papua Tengah
-- Schema PostgreSQL + PostGIS v1.0.0
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
-- 2. TABEL DRIVERS (Mitra Pengemudi)
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_type    VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('motor','mobil')),
    vehicle_plate   VARCHAR(20) NOT NULL UNIQUE,
    vehicle_model   VARCHAR(100),
    vehicle_color   VARCHAR(50),
    ktp_number      VARCHAR(20) NOT NULL,
    ktp_image       TEXT,
    sim_number      VARCHAR(20) NOT NULL,
    sim_image       TEXT,
    stnk_number     VARCHAR(30),
    stnk_image      TEXT,
    selfie_image    TEXT,
    -- PostGIS: lokasi koordinat real-time driver
    location        GEOGRAPHY(POINT, 4326),
    heading         NUMERIC(5,2) DEFAULT 0,       -- arah hadap kendaraan (derajat)
    speed           NUMERIC(6,2) DEFAULT 0,       -- kecepatan km/h
    is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES users(id),
    is_online       BOOLEAN       NOT NULL DEFAULT FALSE,
    is_available    BOOLEAN       NOT NULL DEFAULT TRUE, -- tidak sedang mengerjakan order
    rating          NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
    total_trips     INTEGER       NOT NULL DEFAULT 0,
    total_earnings  NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    location_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index GiST untuk pencarian spasial PostGIS (sangat cepat)
CREATE INDEX IF NOT EXISTS idx_drivers_location  ON drivers USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id   ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_online    ON drivers(is_online, is_available, is_verified);
CREATE INDEX IF NOT EXISTS idx_drivers_vehicle   ON drivers(vehicle_type);

-- ============================================================
-- 3. TABEL MERCHANTS (Pemilik Toko)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_name          VARCHAR(200) NOT NULL,
    store_description   TEXT,
    store_category      VARCHAR(100),
    store_address       TEXT,
    -- PostGIS: koordinat lokasi toko
    location            GEOGRAPHY(POINT, 4326),
    phone               VARCHAR(20),
    operating_hours     VARCHAR(50),
    banner_image        TEXT,
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

CREATE INDEX IF NOT EXISTS idx_merchants_location  ON merchants USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_merchants_user_id   ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_verified  ON merchants(is_verified);
CREATE INDEX IF NOT EXISTS idx_merchants_category  ON merchants(store_category);
-- Full-text search untuk nama toko
CREATE INDEX IF NOT EXISTS idx_merchants_name_trgm ON merchants USING GIN(store_name gin_trgm_ops);

-- ============================================================
-- 4. TABEL PRODUCTS (Produk Toko)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    stock           INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    category        VARCHAR(100),
    image           TEXT,
    images          JSONB         DEFAULT '[]',
    is_available    BOOLEAN       NOT NULL DEFAULT TRUE,
    weight_gram     INTEGER       DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_merchant  ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(is_available);
CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);

-- ============================================================
-- 5. TABEL RENTALS (GooSewa – Barang Sewaan)
-- ============================================================
CREATE TABLE IF NOT EXISTS rentals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    category            VARCHAR(100),
    price_per_day       NUMERIC(12,2) NOT NULL CHECK (price_per_day >= 0),
    price_per_week      NUMERIC(12,2) CHECK (price_per_week >= 0),
    price_per_month     NUMERIC(12,2) CHECK (price_per_month >= 0),
    deposit             NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock               INTEGER       NOT NULL DEFAULT 1 CHECK (stock >= 0),
    available_stock     INTEGER       NOT NULL DEFAULT 1 CHECK (available_stock >= 0),
    -- PostGIS: lokasi barang sewaan
    location            GEOGRAPHY(POINT, 4326),
    address             TEXT,
    images              JSONB         DEFAULT '[]',
    is_available        BOOLEAN       NOT NULL DEFAULT TRUE,
    rating              NUMERIC(3,2)  NOT NULL DEFAULT 0.00,
    total_bookings      INTEGER       NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rentals_owner      ON rentals(owner_id);
CREATE INDEX IF NOT EXISTS idx_rentals_location   ON rentals USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_rentals_available  ON rentals(is_available);
CREATE INDEX IF NOT EXISTS idx_rentals_category   ON rentals(category);
CREATE INDEX IF NOT EXISTS idx_rentals_name_trgm  ON rentals USING GIN(name gin_trgm_ops);

-- ============================================================
-- 6. TABEL ORDERS (Semua Transaksi)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number        VARCHAR(30)   NOT NULL UNIQUE,
    user_id             UUID NOT NULL REFERENCES users(id),
    driver_id           UUID REFERENCES drivers(id),
    merchant_id         UUID REFERENCES merchants(id),
    rental_id           UUID REFERENCES rentals(id),
    service_type        VARCHAR(30)   NOT NULL
                        CHECK (service_type IN ('GooRide','GooCard','GooKurir','GooShop','GooSewa','GooAmbulance')),
    -- PostGIS: Titik jemput & tujuan untuk layanan ride/kurir
    pickup_point        GEOGRAPHY(POINT, 4326),
    pickup_address      TEXT,
    destination_point   GEOGRAPHY(POINT, 4326),
    destination_address TEXT,
    distance_km         NUMERIC(8,3)  DEFAULT 0,
    -- Harga
    base_fare           NUMERIC(12,2) DEFAULT 0,
    distance_fare       NUMERIC(12,2) DEFAULT 0,
    service_fee         NUMERIC(12,2) DEFAULT 0,    -- fee platform
    delivery_fee        NUMERIC(12,2) DEFAULT 0,
    discount_amount     NUMERIC(12,2) DEFAULT 0,
    total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Pembayaran
    payment_method      VARCHAR(30)   DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','wallet','transfer','qris')),
    payment_status      VARCHAR(20)   DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','paid','refunded','failed')),
    -- Item belanja (GooShop) / detail sewa (GooSewa) - JSONB
    items               JSONB         DEFAULT '[]',
    -- Status pesanan
    status              VARCHAR(30)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','searching','no_driver','accepted','on_the_way',
                                          'arrived','in_progress','confirmed','completed','cancelled','rejected')),
    notes               TEXT,
    -- SOS
    sos_activated       BOOLEAN       NOT NULL DEFAULT FALSE,
    sos_at              TIMESTAMPTZ,
    sos_location        GEOGRAPHY(POINT, 4326),
    -- Rating
    user_rating         SMALLINT      CHECK (user_rating BETWEEN 1 AND 5),
    user_review         TEXT,
    -- Waktu
    accepted_at         TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT,
    -- Tanggal sewa (GooSewa)
    rental_start_date   DATE,
    rental_end_date     DATE,
    rental_duration     INTEGER,      -- jumlah hari/minggu/bulan
    rental_period_type  VARCHAR(10)   CHECK (rental_period_type IN ('day','week','month')),
    deposit_amount      NUMERIC(12,2) DEFAULT 0,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id    ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id  ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_rental_id    ON orders(rental_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(service_type);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pickup       ON orders USING GIST(pickup_point);
CREATE INDEX IF NOT EXISTS idx_orders_sos          ON orders(sos_activated) WHERE sos_activated = TRUE;
-- Partial index untuk pesanan aktif (sangat efisien)
CREATE INDEX IF NOT EXISTS idx_orders_active       ON orders(status, driver_id, created_at DESC)
    WHERE status NOT IN ('completed','cancelled','rejected');

-- ============================================================
-- 7. TABEL WALLET TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id        UUID REFERENCES orders(id),
    type            VARCHAR(10)   NOT NULL CHECK (type IN ('credit','debit')),
    amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    balance_before  NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance_after   NUMERIC(15,2) NOT NULL DEFAULT 0,
    description     TEXT,
    payment_method  VARCHAR(30),
    reference_code  VARCHAR(100) UNIQUE,
    status          VARCHAR(20)   NOT NULL DEFAULT 'success'
                    CHECK (status IN ('pending','success','failed','reversed')),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_user_id    ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_order_id   ON wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_type       ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_created_at ON wallet_transactions(created_at DESC);

-- ============================================================
-- 8. TABEL CHATS (In-app Messaging)
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_id   UUID NOT NULL REFERENCES users(id),
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer','driver','merchant','admin')),
    message     TEXT NOT NULL,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_order_id ON chats(order_id);
CREATE INDEX IF NOT EXISTS idx_chats_sender   ON chats(sender_id);
CREATE INDEX IF NOT EXISTS idx_chats_sent_at  ON chats(sent_at DESC);

-- ============================================================
-- 9. TABEL NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50)   NOT NULL,  -- 'order_update','payment','promo','sos', dll
    title       VARCHAR(200),
    message     TEXT NOT NULL,
    data        JSONB DEFAULT '{}',      -- payload tambahan (order_id, dll)
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at DESC);

-- ============================================================
-- 10. TABEL REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id    UUID NOT NULL REFERENCES orders(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    target_id   UUID NOT NULL REFERENCES users(id), -- driver/merchant yang dinilai
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('driver','merchant')),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_reviews_order  ON reviews(order_id);

-- ============================================================
-- 11. TABEL TARIFFS (Konfigurasi Tarif Layanan)
-- ============================================================
CREATE TABLE IF NOT EXISTS tariffs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_type    VARCHAR(30) NOT NULL UNIQUE,
    vehicle_type    VARCHAR(20),
    base_fare       NUMERIC(10,2) NOT NULL,
    per_km_fare     NUMERIC(10,2) NOT NULL,
    min_distance_km NUMERIC(5,2)  DEFAULT 1.0,
    max_distance_km NUMERIC(5,2)  DEFAULT 50.0,
    platform_fee_pct NUMERIC(5,2) DEFAULT 20.00,  -- % potongan platform
    surge_multiplier NUMERIC(4,2) DEFAULT 1.00,   -- tarif surge saat ramai
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. TABEL ADMIN LOGS (Audit Trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID NOT NULL REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin   ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

-- ============================================================
-- 13. FUNGSI POSTGIS: Cari Driver Terdekat
-- Menggunakan ST_DWithin (PostGIS sphere) + ST_Distance
-- ============================================================
CREATE OR REPLACE FUNCTION find_nearby_drivers(
    search_lat      FLOAT,
    search_lng      FLOAT,
    radius_meters   FLOAT DEFAULT 5000,   -- radius dalam meter (default 5 km)
    p_vehicle_type  VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    driver_id       UUID,
    user_id         UUID,
    vehicle_type    VARCHAR,
    vehicle_plate   VARCHAR,
    vehicle_model   VARCHAR,
    vehicle_color   VARCHAR,
    rating          NUMERIC,
    total_trips     INTEGER,
    distance_meters FLOAT,
    latitude        FLOAT,
    longitude       FLOAT,
    driver_name     VARCHAR,
    driver_phone    VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id                            AS driver_id,
        d.user_id                       AS user_id,
        d.vehicle_type                  AS vehicle_type,
        d.vehicle_plate                 AS vehicle_plate,
        d.vehicle_model                 AS vehicle_model,
        d.vehicle_color                 AS vehicle_color,
        d.rating                        AS rating,
        d.total_trips                   AS total_trips,
        ST_Distance(
            d.location::geography,
            ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography
        )                               AS distance_meters,
        ST_Y(d.location::geometry)      AS latitude,
        ST_X(d.location::geometry)      AS longitude,
        u.name                          AS driver_name,
        u.phone                         AS driver_phone
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE
        d.is_online     = TRUE
        AND d.is_verified  = TRUE
        AND d.is_available = TRUE
        AND u.is_active    = TRUE
        AND d.location IS NOT NULL
        -- ST_DWithin menggunakan index GiST — sangat cepat!
        AND ST_DWithin(
            d.location::geography,
            ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography,
            radius_meters
        )
        AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 14. FUNGSI POSTGIS: Hitung Jarak antara 2 Titik (Haversine via PostGIS)
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_distance_km(
    lat1 FLOAT, lng1 FLOAT,
    lat2 FLOAT, lng2 FLOAT
)
RETURNS FLOAT AS $$
BEGIN
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lng1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lng2, lat2), 4326)::geography
    ) / 1000.0;  -- convert meter ke kilometer
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 15. FUNGSI: Auto-update 'updated_at' trigger
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pasang trigger ke semua tabel yang punya updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','drivers','merchants','products','rentals','orders','tariffs'] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
             CREATE TRIGGER trg_set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
            t, t
        );
    END LOOP;
END $$;

-- ============================================================
-- 16. VIEW: Pesanan aktif dengan info lengkap
-- ============================================================
CREATE OR REPLACE VIEW v_active_orders AS
SELECT
    o.id, o.order_number, o.service_type, o.status,
    o.total_amount, o.payment_method, o.sos_activated,
    o.created_at,
    -- User info
    u.name      AS user_name,
    u.phone     AS user_phone,
    -- Driver info
    d.vehicle_plate, d.vehicle_type,
    du.name     AS driver_name,
    du.phone    AS driver_phone,
    -- PostGIS: koordinat pickup & destination
    ST_Y(o.pickup_point::geometry)       AS pickup_lat,
    ST_X(o.pickup_point::geometry)       AS pickup_lng,
    ST_Y(o.destination_point::geometry)  AS destination_lat,
    ST_X(o.destination_point::geometry)  AS destination_lng,
    o.pickup_address, o.destination_address, o.distance_km
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN drivers d  ON d.id = o.driver_id
LEFT JOIN users du   ON du.id = d.user_id
WHERE o.status NOT IN ('completed','cancelled','rejected');

-- ============================================================
-- 17. VIEW: Dashboard stats summary
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_active = TRUE)   AS total_customers,
    (SELECT COUNT(*) FROM users WHERE role = 'driver' AND is_active = TRUE)     AS total_drivers,
    (SELECT COUNT(*) FROM drivers WHERE is_verified = TRUE)                     AS verified_drivers,
    (SELECT COUNT(*) FROM drivers WHERE is_online = TRUE)                       AS online_drivers,
    (SELECT COUNT(*) FROM merchants)                                            AS total_merchants,
    (SELECT COUNT(*) FROM merchants WHERE is_verified = TRUE)                   AS verified_merchants,
    (SELECT COUNT(*) FROM orders)                                               AS total_orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'completed')                    AS completed_orders,
    (SELECT COUNT(*) FROM orders WHERE status NOT IN ('completed','cancelled','rejected')) AS active_orders,
    (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status = 'completed') AS total_revenue,
    (SELECT COALESCE(SUM(service_fee),0) FROM orders WHERE status = 'completed')  AS platform_fee,
    (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE)         AS today_orders,
    (SELECT COALESCE(SUM(total_amount),0) FROM orders
     WHERE status = 'completed' AND DATE(completed_at) = CURRENT_DATE)          AS today_revenue,
    (SELECT COUNT(*) FROM orders WHERE sos_activated = TRUE)                    AS sos_count;
