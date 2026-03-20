/**
 * googleMapsService.js
 * ─────────────────────────────────────────────────────────────
 * Wrapper lengkap Google Maps Platform untuk GONAB backend:
 *   • Geocoding API        – alamat ↔ koordinat
 *   • Directions API       – rute & polyline
 *   • Distance Matrix API  – jarak + waktu tempuh (multi titik)
 *   • Places API           – autocomplete & detail tempat
 *   • Roads API            – snap-to-road (tracking driver)
 *
 * Fallback Haversine dipakai otomatis saat API key belum diisi
 * atau saat kuota habis supaya server tetap berjalan.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

const https = require('https');

const API_KEY  = process.env.GOOGLE_MAPS_API_KEY || '';
const HAS_KEY  = API_KEY && API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY';

const BASE = {
  geocoding : 'https://maps.googleapis.com/maps/api/geocode/json',
  directions: 'https://maps.googleapis.com/maps/api/directions/json',
  distMatrix: 'https://maps.googleapis.com/maps/api/distancematrix/json',
  places    : 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  placeDetail:'https://maps.googleapis.com/maps/api/place/details/json',
  snapRoad  : 'https://roads.googleapis.com/v1/snapToRoads',
};

// ─── Internal HTTP helper ─────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Maps API')); }
      });
    }).on('error', reject);
  });
}

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// ─── Haversine fallback ───────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dG = ((lng2 - lng1) * Math.PI) / 180;
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── 1. Geocoding: address → {lat, lng} ──────────────────────
async function geocodeAddress(address) {
  if (!HAS_KEY) {
    return {
      success: false,
      source : 'no_api_key',
      address,
      lat    : parseFloat(process.env.NABIRE_LAT) || -3.3667,
      lng    : parseFloat(process.env.NABIRE_LNG) || 135.4967,
    };
  }
  try {
    const url  = `${BASE.geocoding}?${qs({ address, key: API_KEY })}`;
    const data = await httpGet(url);
    if (data.status !== 'OK' || !data.results.length) {
      return { success: false, source: 'google', status: data.status, error_message: data.error_message };
    }
    const loc = data.results[0].geometry.location;
    return {
      success         : true,
      source          : 'google',
      formatted_address: data.results[0].formatted_address,
      lat             : loc.lat,
      lng             : loc.lng,
      place_id        : data.results[0].place_id,
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 2. Reverse Geocoding: {lat, lng} → address ───────────────
async function reverseGeocode(lat, lng) {
  if (!HAS_KEY) {
    return {
      success          : false,
      source           : 'no_api_key',
      formatted_address: `${lat}, ${lng}`,
      lat, lng,
    };
  }
  try {
    const url  = `${BASE.geocoding}?${qs({ latlng: `${lat},${lng}`, key: API_KEY })}`;
    const data = await httpGet(url);
    if (data.status !== 'OK' || !data.results.length) {
      return { success: false, source: 'google', status: data.status };
    }
    const r = data.results[0];
    return {
      success          : true,
      source           : 'google',
      formatted_address: r.formatted_address,
      place_id         : r.place_id,
      lat, lng,
      components       : r.address_components,
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 3. Directions: rute + polyline ──────────────────────────
async function getDirections(originLat, originLng, destLat, destLng, options = {}) {
  const distKm = haversineKm(originLat, originLng, destLat, destLng);

  if (!HAS_KEY) {
    return {
      success      : true,
      source       : 'haversine_fallback',
      distance_km  : parseFloat(distKm.toFixed(2)),
      duration_min : Math.ceil((distKm / 30) * 60),   // ~30 km/h kota
      polyline     : null,
      steps        : [],
    };
  }
  try {
    const params = {
      origin     : `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      mode       : options.mode || 'driving',
      language   : 'id',
      key        : API_KEY,
    };
    if (options.waypoints) params.waypoints = options.waypoints;
    if (options.avoid)     params.avoid     = options.avoid;

    const url  = `${BASE.directions}?${qs(params)}`;
    const data = await httpGet(url);

    if (data.status !== 'OK' || !data.routes.length) {
      // fallback to haversine
      return {
        success      : true,
        source       : 'haversine_fallback',
        distance_km  : parseFloat(distKm.toFixed(2)),
        duration_min : Math.ceil((distKm / 30) * 60),
        polyline     : null,
        steps        : [],
        google_status: data.status,
      };
    }

    const leg = data.routes[0].legs[0];
    return {
      success      : true,
      source       : 'google',
      distance_km  : parseFloat((leg.distance.value / 1000).toFixed(2)),
      distance_text: leg.distance.text,
      duration_min : Math.ceil(leg.duration.value / 60),
      duration_text: leg.duration.text,
      start_address: leg.start_address,
      end_address  : leg.end_address,
      polyline     : data.routes[0].overview_polyline?.points || null,
      steps        : leg.steps.map(s => ({
        instruction   : s.html_instructions.replace(/<[^>]+>/g, ''),
        distance_text : s.distance.text,
        duration_text : s.duration.text,
        travel_mode   : s.travel_mode,
        start_location: s.start_location,
        end_location  : s.end_location,
        polyline      : s.polyline?.points,
      })),
    };
  } catch (err) {
    return {
      success      : true,
      source       : 'haversine_fallback',
      distance_km  : parseFloat(distKm.toFixed(2)),
      duration_min : Math.ceil((distKm / 30) * 60),
      polyline     : null,
      steps        : [],
      error        : err.message,
    };
  }
}

// ─── 4. Distance Matrix: multi origins × multi destinations ──
async function getDistanceMatrix(origins, destinations) {
  // origins / destinations: array of "lat,lng" string atau address string
  if (!HAS_KEY) {
    const rows = origins.map((o) => {
      const [oLat, oLng] = o.split(',').map(Number);
      return {
        elements: destinations.map((d) => {
          const [dLat, dLng] = d.split(',').map(Number);
          const km = haversineKm(oLat, oLng, dLat, dLng);
          return {
            status       : 'OK',
            source       : 'haversine_fallback',
            distance     : { value: Math.round(km * 1000), text: `${km.toFixed(1)} km` },
            duration     : { value: Math.round((km / 30) * 3600), text: `${Math.ceil((km / 30) * 60)} menit` },
          };
        }),
      };
    });
    return { success: true, source: 'haversine_fallback', rows };
  }
  try {
    const url = `${BASE.distMatrix}?${qs({
      origins     : origins.join('|'),
      destinations: destinations.join('|'),
      mode        : 'driving',
      language    : 'id',
      key         : API_KEY,
    })}`;
    const data = await httpGet(url);
    if (data.status !== 'OK') {
      return { success: false, source: 'google', status: data.status };
    }
    return {
      success           : true,
      source            : 'google',
      origin_addresses  : data.origin_addresses,
      dest_addresses    : data.destination_addresses,
      rows              : data.rows,
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 5. Places Autocomplete ───────────────────────────────────
async function placesAutocomplete(input, lat, lng, radiusMeters = 50000) {
  if (!HAS_KEY) {
    return { success: false, source: 'no_api_key', predictions: [] };
  }
  try {
    const url = `${BASE.places}?${qs({
      input,
      location: `${lat},${lng}`,
      radius  : radiusMeters,
      language: 'id',
      components: 'country:id',
      key     : API_KEY,
    })}`;
    const data = await httpGet(url);
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return { success: false, source: 'google', status: data.status };
    }
    return {
      success    : true,
      source     : 'google',
      predictions: (data.predictions || []).map(p => ({
        place_id           : p.place_id,
        description        : p.description,
        main_text          : p.structured_formatting?.main_text,
        secondary_text     : p.structured_formatting?.secondary_text,
        distance_meters    : p.distance_meters,
      })),
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 6. Place Detail (place_id → detail lengkap) ─────────────
async function getPlaceDetail(placeId) {
  if (!HAS_KEY) {
    return { success: false, source: 'no_api_key' };
  }
  try {
    const url = `${BASE.placeDetail}?${qs({
      place_id: placeId,
      fields  : 'name,formatted_address,geometry,opening_hours,rating,photos,website,formatted_phone_number',
      language: 'id',
      key     : API_KEY,
    })}`;
    const data = await httpGet(url);
    if (data.status !== 'OK') {
      return { success: false, source: 'google', status: data.status };
    }
    const r = data.result;
    return {
      success          : true,
      source           : 'google',
      name             : r.name,
      formatted_address: r.formatted_address,
      lat              : r.geometry?.location?.lat,
      lng              : r.geometry?.location?.lng,
      rating           : r.rating,
      opening_hours    : r.opening_hours?.weekday_text || null,
      phone            : r.formatted_phone_number || null,
      website          : r.website || null,
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 7. Snap to Road (tracking driver) ───────────────────────
async function snapToRoads(pathPoints) {
  // pathPoints: array of {lat, lng}
  if (!HAS_KEY) {
    return { success: false, source: 'no_api_key', snapped_points: pathPoints };
  }
  try {
    const path = pathPoints.map(p => `${p.lat},${p.lng}`).join('|');
    const url  = `${BASE.snapRoad}?${qs({ path, interpolate: true, key: API_KEY })}`;
    const data = await httpGet(url);
    if (!data.snappedPoints) {
      return { success: false, source: 'google', error: 'No snapped points' };
    }
    return {
      success       : true,
      source        : 'google',
      snapped_points: data.snappedPoints.map(sp => ({
        lat          : sp.location.latitude,
        lng          : sp.location.longitude,
        original_idx : sp.originalIndex,
      })),
    };
  } catch (err) {
    return { success: false, source: 'google', error: err.message };
  }
}

// ─── 8. Convenience: hitung ongkos kirim dengan jarak aktual ──
/**
 * estimateFareWithMaps(originLat, originLng, destLat, destLng, tariff)
 *
 * tariff = { base_fare, per_km_rate, min_fare, surge_multiplier }
 * Returns { distance_km, duration_min, fare, breakdown }
 */
async function estimateFareWithMaps(originLat, originLng, destLat, destLng, tariff) {
  const route = await getDirections(originLat, originLng, destLat, destLng);

  const distKm = route.distance_km;
  const surge  = parseFloat(tariff.surge_multiplier || 1);
  const base   = parseFloat(tariff.base_fare   || 0);
  const perKm  = parseFloat(tariff.per_km_rate || 0);
  const minFare= parseFloat(tariff.min_fare    || 0);

  const rawFare = (base + distKm * perKm) * surge;
  const fare    = Math.max(rawFare, minFare);

  return {
    success     : true,
    source      : route.source,
    distance_km : distKm,
    duration_min: route.duration_min,
    duration_text: route.duration_text || `${route.duration_min} menit`,
    polyline    : route.polyline,
    fare        : Math.round(fare / 500) * 500,   // bulatkan ke 500
    fare_raw    : Math.round(fare),
    breakdown   : {
      base_fare       : base,
      distance_km     : distKm,
      per_km_rate     : perKm,
      distance_charge : Math.round(distKm * perKm),
      surge_multiplier: surge,
      min_fare        : minFare,
    },
  };
}

// ─── 9. Status / diagnostik ──────────────────────────────────
function getMapsStatus() {
  return {
    api_key_configured: !!HAS_KEY,
    api_key_preview   : HAS_KEY ? `${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}` : null,
    fallback_mode     : !HAS_KEY,
    nabire_center     : {
      lat: parseFloat(process.env.NABIRE_LAT) || -3.3667,
      lng: parseFloat(process.env.NABIRE_LNG) || 135.4967,
    },
    services: {
      geocoding      : 'Geocoding API',
      reverse        : 'Geocoding API (reverse)',
      directions     : 'Directions API',
      distance_matrix: 'Distance Matrix API',
      places         : 'Places API (Autocomplete)',
      place_detail   : 'Places API (Detail)',
      snap_to_roads  : 'Roads API',
    },
  };
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  getDirections,
  getDistanceMatrix,
  placesAutocomplete,
  getPlaceDetail,
  snapToRoads,
  estimateFareWithMaps,
  getMapsStatus,
  haversineKm,         // exported untuk dipakai controller lain
};
