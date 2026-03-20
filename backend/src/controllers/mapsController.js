/**
 * mapsController.js
 * Endpoint REST untuk semua fitur Google Maps Platform
 */

'use strict';

const {
  geocodeAddress,
  reverseGeocode,
  getDirections,
  getDistanceMatrix,
  placesAutocomplete,
  getPlaceDetail,
  snapToRoads,
  estimateFareWithMaps,
  getMapsStatus,
} = require('../services/googleMapsService');
const { query }             = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/maps/status ─────────────────────────────────────
const getStatus = (req, res) => {
  return sendSuccess(res, getMapsStatus(), 'Google Maps Platform status.');
};

// ─── GET /api/maps/geocode?address=... ────────────────────────
const geocode = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return sendError(res, 'Parameter address wajib diisi.');
    const result = await geocodeAddress(address);
    return sendSuccess(res, result, result.success ? 'Geocoding berhasil.' : 'Geocoding gagal (fallback).');
  } catch (err) {
    return sendError(res, 'Gagal geocoding: ' + err.message, 500);
  }
};

// ─── GET /api/maps/reverse?lat=&lng= ─────────────────────────
const reverse = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return sendError(res, 'Parameter lat dan lng wajib diisi.');
    const result = await reverseGeocode(parseFloat(lat), parseFloat(lng));
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal reverse geocoding: ' + err.message, 500);
  }
};

// ─── GET /api/maps/directions ─────────────────────────────────
// Query: origin_lat, origin_lng, dest_lat, dest_lng, [mode]
const directions = async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng, mode } = req.query;
    if (!origin_lat || !origin_lng || !dest_lat || !dest_lng)
      return sendError(res, 'origin_lat, origin_lng, dest_lat, dest_lng wajib diisi.');
    const result = await getDirections(
      parseFloat(origin_lat), parseFloat(origin_lng),
      parseFloat(dest_lat),   parseFloat(dest_lng),
      { mode: mode || 'driving' }
    );
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal mengambil rute: ' + err.message, 500);
  }
};

// ─── POST /api/maps/distance-matrix ──────────────────────────
// Body: { origins: ["lat,lng",...], destinations: ["lat,lng",...] }
const distanceMatrix = async (req, res) => {
  try {
    const { origins, destinations } = req.body;
    if (!Array.isArray(origins) || !Array.isArray(destinations) || !origins.length || !destinations.length)
      return sendError(res, 'origins dan destinations (array) wajib diisi.');
    if (origins.length > 10 || destinations.length > 10)
      return sendError(res, 'Maksimal 10 origins dan 10 destinations.');
    const result = await getDistanceMatrix(origins, destinations);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal Distance Matrix: ' + err.message, 500);
  }
};

// ─── GET /api/maps/places/autocomplete ───────────────────────
// Query: input, lat, lng, [radius]
const autocomplete = async (req, res) => {
  try {
    const { input, lat, lng, radius } = req.query;
    if (!input) return sendError(res, 'Parameter input wajib diisi.');
    const centerLat = parseFloat(lat)    || parseFloat(process.env.NABIRE_LAT) || -3.3667;
    const centerLng = parseFloat(lng)    || parseFloat(process.env.NABIRE_LNG) || 135.4967;
    const result    = await placesAutocomplete(input, centerLat, centerLng, parseInt(radius) || 50000);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal autocomplete: ' + err.message, 500);
  }
};

// ─── GET /api/maps/places/:placeId ───────────────────────────
const placeDetail = async (req, res) => {
  try {
    const { placeId } = req.params;
    if (!placeId) return sendError(res, 'placeId wajib diisi.');
    const result = await getPlaceDetail(placeId);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail place: ' + err.message, 500);
  }
};

// ─── POST /api/maps/snap-to-roads ────────────────────────────
// Body: { points: [{lat,lng},...] }
const snapRoads = async (req, res) => {
  try {
    const { points } = req.body;
    if (!Array.isArray(points) || !points.length)
      return sendError(res, 'points (array {lat,lng}) wajib diisi.');
    if (points.length > 100) return sendError(res, 'Maksimal 100 titik per request.');
    const result = await snapToRoads(points);
    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, 'Gagal snap-to-roads: ' + err.message, 500);
  }
};

// ─── GET /api/maps/fare-estimate ─────────────────────────────
// Query: origin_lat, origin_lng, dest_lat, dest_lng, service_type
const fareEstimate = async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng, service_type } = req.query;
    if (!origin_lat || !origin_lng || !dest_lat || !dest_lng)
      return sendError(res, 'Koordinat asal dan tujuan wajib diisi.');

    // Ambil tarif dari DB
    let tariff = null;
    if (service_type) {
      const { rows } = await query(
        `SELECT * FROM tariffs WHERE service_type = $1 LIMIT 1`,
        [service_type]
      );
      tariff = rows[0] || null;
    }
    // Default tariff fallback
    if (!tariff) {
      tariff = { base_fare: 10000, per_km_rate: 3000, min_fare: 10000, surge_multiplier: 1 };
    }

    const result = await estimateFareWithMaps(
      parseFloat(origin_lat), parseFloat(origin_lng),
      parseFloat(dest_lat),   parseFloat(dest_lng),
      tariff
    );
    return sendSuccess(res, { ...result, service_type: service_type || 'custom', tariff });
  } catch (err) {
    return sendError(res, 'Gagal estimasi ongkos: ' + err.message, 500);
  }
};

// ─── GET /api/maps/drivers/nearby ────────────────────────────
// Query: lat, lng, radius (km), vehicle_type
const nearbyDriversMap = async (req, res) => {
  try {
    const { lat, lng, radius = 5, vehicle_type } = req.query;
    if (!lat || !lng) return sendError(res, 'Koordinat lat dan lng wajib diisi.');

    const params = [parseFloat(lng), parseFloat(lat), parseFloat(radius) * 1000];
    let extra = '';
    if (vehicle_type) { params.push(vehicle_type); extra = `AND d.vehicle_type=$${params.length}`; }

    const { rows } = await query(
      `SELECT
         d.id, u.name, d.vehicle_type, d.vehicle_plate, d.vehicle_model, d.vehicle_color,
         d.rating, d.total_trips, d.is_verified,
         ST_Y(d.location::geometry) AS lat,
         ST_X(d.location::geometry) AS lng,
         ST_Distance(
           d.location::geography,
           ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
         ) / 1000 AS distance_km,
         d.location_updated_at
       FROM drivers d JOIN users u ON u.id=d.user_id
       WHERE d.is_online=TRUE AND d.is_verified=TRUE
         AND d.location IS NOT NULL
         AND ST_DWithin(
           d.location::geography,
           ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3
         ) ${extra}
       ORDER BY distance_km ASC LIMIT 20`,
      params
    );

    return sendSuccess(res, {
      drivers         : rows,
      count           : rows.length,
      search_center   : { lat: parseFloat(lat), lng: parseFloat(lng) },
      search_radius_km: parseFloat(radius),
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil driver terdekat: ' + err.message, 500);
  }
};

// ─── GET /api/maps/config ─────────────────────────────────────
// Kirim config Maps ke frontend (API key untuk JS SDK, center kota)
const getMapConfig = (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  const hasKey = key && key !== 'YOUR_GOOGLE_MAPS_API_KEY';
  return sendSuccess(res, {
    api_key         : hasKey ? key : null,
    api_key_ready   : hasKey,
    center          : {
      lat: parseFloat(process.env.NABIRE_LAT) || -3.3667,
      lng: parseFloat(process.env.NABIRE_LNG) || 135.4967,
    },
    default_zoom    : 13,
    city            : 'Nabire',
    province        : 'Papua Tengah',
    driver_radius_km: parseFloat(process.env.DRIVER_SEARCH_RADIUS_KM) || 3,
    map_styles_hint : 'Use MAP_ID or custom styles for branded map.',
  });
};

module.exports = {
  getStatus,
  geocode,
  reverse,
  directions,
  distanceMatrix,
  autocomplete,
  placeDetail,
  snapRoads,
  fareEstimate,
  nearbyDriversMap,
  getMapConfig,
};
