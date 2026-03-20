-- ============================================================
-- GONAB – Seed Data (Data Awal / Demo)
-- Kabupaten Nabire, Papua Tengah
-- Koordinat pusat: -3.3640°LS, 135.4960°BT
-- Password hash: bcrypt("password123", 10)
-- Admin hash:    bcrypt("Admin@gonab2024", 10)
-- ============================================================

-- ============================================================
-- 1. TARIF LAYANAN
-- ============================================================
INSERT INTO tariffs (service_type, vehicle_type, base_fare, per_km_fare, platform_fee_pct) VALUES
('GooRide',      'motor', 10000, 3000, 20.00),
('GooCard',      'mobil', 15000, 5000, 20.00),
('GooKurir',     'motor',  8000, 2500, 20.00),
('GooAmbulance', 'mobil', 25000, 4000, 10.00),
('GooShop',      NULL,        0,    0, 15.00),
('GooSewa',      NULL,        0,    0, 10.00)
ON CONFLICT (service_type) DO UPDATE
    SET base_fare        = EXCLUDED.base_fare,
        per_km_fare      = EXCLUDED.per_km_fare,
        platform_fee_pct = EXCLUDED.platform_fee_pct,
        updated_at       = NOW();

-- ============================================================
-- 2. USERS
-- ============================================================
INSERT INTO users (id, name, phone, email, password, role, wallet_balance, is_verified, is_active)
VALUES
-- Admin
('b0c53077-fa19-4ef5-ad9a-e764e19f7ea8',
 'Admin GONAB','082199990000','admin@gonab.id',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'admin', 0, TRUE, TRUE),
-- Customers
('a9298f3f-63f2-4ba6-8298-e025fd13eb4e',
 'Budi Santoso','081234567890','budi@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'customer', 150000, TRUE, TRUE),
('a5d94e22-939e-49c9-a8be-853c82dc75db',
 'Siti Rahayu','085678901234','siti@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'customer', 75000, TRUE, TRUE),
('3b65bfd9-19f0-44ff-81fd-91a0f0d2b66a',
 'Yohanes Waromi','082300112233','yohanes@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'customer', 0, TRUE, TRUE),
-- Drivers
('a425daba-d454-4e45-a5a1-502a60f64d27',
 'Joko Widodo','082111222333','joko.driver@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'driver', 200000, TRUE, TRUE),
('39595a7f-f551-4916-945b-198940ab72a4',
 'Ahmad Fauzi','082444555666','ahmad.driver@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'driver', 180000, TRUE, TRUE),
('6dbf6ceb-6d48-4f50-a000-2a7660a474f9',
 'Daniel Imbiri','082777123456','daniel.driver@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'driver', 95000, TRUE, TRUE),
-- Merchants
('27731385-cace-4250-a539-df1482267a6f',
 'Pemilik Fotokopi RRJM','082777888999','rrjm@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'merchant', 500000, TRUE, TRUE),
('628c8716-b986-4da8-b179-2e3a9ca655a2',
 'Pemilik Warung Mama Papua','082333444555','mamapapua@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'merchant', 350000, TRUE, TRUE),
('a3d03b98-6714-4236-88c0-7c273163fe41',
 'Rental Nabire Jaya','082666777888','nabirejaya@example.com',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy2',
 'merchant', 800000, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. DRIVERS
-- ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
-- ============================================================
INSERT INTO drivers (id, user_id, vehicle_type, vehicle_plate, vehicle_model, vehicle_color,
                     ktp_number, sim_number, stnk_number,
                     location, is_verified, is_online, is_available, rating, total_trips)
VALUES
('4fd322cd-d64a-47ee-bace-563614b69f02',
 'a425daba-d454-4e45-a5a1-502a60f64d27',
 'motor','PB 1234 AB','Honda Beat','Hitam',
 '9103041234567890','SIM123456','STNK123456',
 ST_SetSRID(ST_MakePoint(135.4960, -3.3640), 4326),
 TRUE, TRUE, TRUE, 4.85, 245),
('9a332fcd-bedf-4f6d-8cf6-c3ee3e78524e',
 '39595a7f-f551-4916-945b-198940ab72a4',
 'mobil','PB 5678 CD','Toyota Avanza','Putih',
 '9103041234567891','SIM789012','STNK789012',
 ST_SetSRID(ST_MakePoint(135.5010, -3.3720), 4326),
 TRUE, TRUE, TRUE, 4.92, 312),
('85eec6b7-696d-4da6-b60a-3fd5859bc74c',
 '6dbf6ceb-6d48-4f50-a000-2a7660a474f9',
 'motor','PB 9012 EF','Yamaha Mio','Merah',
 '9103041234567892','SIM345678','STNK345678',
 ST_SetSRID(ST_MakePoint(135.4900, -3.3800), 4326),
 TRUE, FALSE, TRUE, 4.70, 87)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. MERCHANTS
-- ============================================================
INSERT INTO merchants (id, user_id, store_name, store_description, store_category,
                       store_address, location, phone, operating_hours,
                       is_open, is_verified, rating, total_orders)
VALUES
('6a1df437-40b7-4cb8-936f-b0097a27d701',
 '27731385-cace-4250-a539-df1482267a6f',
 'Fotokopi RRJM',
 'Layanan fotokopi, print, laminating, jilid, dan scan dokumen berkualitas di Nabire',
 'Percetakan',
 'Jl. Pemuda No. 12, Kelurahan Karang Mulia, Nabire',
 ST_SetSRID(ST_MakePoint(135.4970, -3.3650), 4326),
 '082777888999','08:00 - 21:00',
 TRUE, TRUE, 4.70, 120),
('d08e73a1-ffc1-452d-8af7-cfaad8829270',
 '628c8716-b986-4da8-b179-2e3a9ca655a2',
 'Warung Mama Papua',
 'Masakan khas Papua dan makanan sehari-hari, halal dan segar, langsung dari dapur mama',
 'Makanan & Minuman',
 'Jl. Trans Papua No. 45, Nabire',
 ST_SetSRID(ST_MakePoint(135.5020, -3.3690), 4326),
 '082333444555','07:00 - 22:00',
 TRUE, TRUE, 4.90, 350)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. PRODUCTS
-- ============================================================
INSERT INTO products (id, merchant_id, name, description, price, stock, category, is_available)
VALUES
-- Fotokopi RRJM
('5d60d004-50e0-41bc-95d8-4f61ab4cb01d',
 '6a1df437-40b7-4cb8-936f-b0097a27d701',
 'Fotokopi Hitam Putih',
 'Fotokopi dokumen hitam putih per lembar, kertas A4/F4/Legal',
 500, 9999,'Percetakan', TRUE),
('094d4c59-9411-4098-ae22-85626b82f112',
 '6a1df437-40b7-4cb8-936f-b0097a27d701',
 'Print Warna A4',
 'Cetak dokumen berwarna ukuran A4, kualitas tinggi, tinta pigment',
 3000, 9999,'Percetakan', TRUE),
('aacc5b66-94f1-4009-b786-88e9f616beeb',
 '6a1df437-40b7-4cb8-936f-b0097a27d701',
 'Laminating A4',
 'Laminating dokumen atau foto ukuran A4 agar tahan lama',
 5000, 9999,'Percetakan', TRUE),
('8c64e9e5-05e3-4fa0-8e63-01b37d1eedcb',
 '6a1df437-40b7-4cb8-936f-b0097a27d701',
 'Jilid Spiral',
 'Penjilidan laporan, skripsi, makalah dengan spiral plastik warna',
 15000, 500,'Percetakan', TRUE),
-- Warung Mama Papua
('40fffa0d-aa77-4161-8ab8-37e0c5655e46',
 'd08e73a1-ffc1-452d-8af7-cfaad8829270',
 'Nasi + Ikan Bakar',
 'Nasi putih dengan ikan bakar bumbu khas Papua, sambal, dan lalapan segar',
 25000, 50,'Makanan & Minuman', TRUE),
('54407af7-c9e8-4094-8af9-9944a490a99e',
 'd08e73a1-ffc1-452d-8af7-cfaad8829270',
 'Papeda + Kuah Kuning',
 'Makanan khas Papua: sagu cair dengan kuah ikan tongkol bumbu kuning',
 20000, 30,'Makanan & Minuman', TRUE),
('a88c8cb2-2ff5-4ab3-b82d-71af417bd1fa',
 'd08e73a1-ffc1-452d-8af7-cfaad8829270',
 'Nasi Goreng Seafood',
 'Nasi goreng dengan campuran udang, cumi, dan ikan, bumbu pedas manis',
 22000, 40,'Makanan & Minuman', TRUE),
('e75c76be-1432-449a-aa57-7ccc3d1e4358',
 'd08e73a1-ffc1-452d-8af7-cfaad8829270',
 'Es Teh Manis Papua',
 'Teh manis dingin segar khas Papua',
 5000, 100,'Minuman', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. RENTALS (GooSewa)
-- ============================================================
INSERT INTO rentals (id, owner_id, name, description, category,
                     price_per_day, price_per_week, price_per_month, deposit,
                     stock, available_stock, location, address, is_available, rating)
VALUES
('05b0c914-7db6-4ff5-b2db-12c1970227b1',
 'a3d03b98-6714-4236-88c0-7c273163fe41',
 'Tenda Pesta Besar',
 'Tenda pesta kapasitas 200 orang, lengkap kursi lipat, meja, dekorasi dasar. Cocok untuk pernikahan dan acara resmi di Nabire.',
 'Tenda & Event',
 500000, 2500000, NULL, 1000000, 3, 2,
 ST_SetSRID(ST_MakePoint(135.4990, -3.3670), 4326),
 'Jl. Saireri No. 8, Nabire', TRUE, 4.80),
('b468118e-f512-4efc-82e9-ab663e3a742e',
 'a3d03b98-6714-4236-88c0-7c273163fe41',
 'Set Alat Musik Band Lengkap',
 'Paket: gitar elektrik, bass, drum, keyboard, sound system 5000W. Ideal untuk pentas seni dan acara budaya.',
 'Alat Musik',
 350000, 1500000, NULL, 500000, 2, 1,
 ST_SetSRID(ST_MakePoint(135.4990, -3.3670), 4326),
 'Jl. Saireri No. 8, Nabire', TRUE, 4.60),
('fcf142ec-6592-4033-b23f-9d6e226908ad',
 'a3d03b98-6714-4236-88c0-7c273163fe41',
 'Kamar Kos Harian Strategis',
 'Kos harian pusat kota Nabire. Fasilitas: AC, WiFi, kamar mandi dalam, kasur spring bed. Dekat pasar dan kantor.',
 'Kos & Penginapan',
 150000, 800000, 2500000, 200000, 5, 3,
 ST_SetSRID(ST_MakePoint(135.4950, -3.3710), 4326),
 'Jl. Halmahera No. 22, Nabire', TRUE, 4.70),
('4ab84be4-11e2-429c-bcbc-36b462bd8683',
 'a3d03b98-6714-4236-88c0-7c273163fe41',
 'Generator Listrik 5000W',
 'Generator diesel 5000W, cocok untuk acara outdoor dan konstruksi. Termasuk BBM 4 jam.',
 'Alat Bangunan',
 200000, 900000, NULL, 300000, 2, 2,
 ST_SetSRID(ST_MakePoint(135.4990, -3.3670), 4326),
 'Jl. Saireri No. 8, Nabire', TRUE, 4.50)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. SAMPLE ORDER (GooRide – Selesai)
-- ============================================================
INSERT INTO orders (
    id, order_number, user_id, driver_id, service_type,
    pickup_point, pickup_address,
    destination_point, destination_address,
    distance_km, base_fare, distance_fare, service_fee,
    total_amount, payment_method, payment_status,
    status, completed_at, created_at
) VALUES (
    '9a25f1b0-7191-4d8a-b743-2b3216222f05',
    'GRD-20260320-0001',
    'a9298f3f-63f2-4ba6-8298-e025fd13eb4e',
    '4fd322cd-d64a-47ee-bace-563614b69f02',
    'GooRide',
    ST_SetSRID(ST_MakePoint(135.4980, -3.3660), 4326),
    'Jl. Ahmad Yani, Nabire',
    ST_SetSRID(ST_MakePoint(135.5050, -3.3750), 4326),
    'Pasar Saniri, Nabire',
    3.20, 10000, 9600, 3920,
    19600, 'cash', 'paid',
    'completed', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;

-- Update driver stats
UPDATE drivers SET total_trips = total_trips + 0 WHERE id = '4fd322cd-d64a-47ee-bace-563614b69f02';

-- ============================================================
-- 8. GRANT permissions
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gonab_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO gonab_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gonab_user;
