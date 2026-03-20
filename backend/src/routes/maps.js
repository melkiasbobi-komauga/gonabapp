const express = require('express');
const router  = express.Router();
const {
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
} = require('../controllers/mapsController');
const { authMiddleware } = require('../middleware/auth');

// ── Public endpoints ──────────────────────────────────────────
router.get('/status',              getStatus);
router.get('/config',              getMapConfig);
router.get('/geocode',             geocode);
router.get('/reverse',             reverse);
router.get('/directions',          directions);
router.post('/distance-matrix',    distanceMatrix);
router.get('/places/autocomplete', autocomplete);
router.get('/places/:placeId',     placeDetail);
router.get('/fare-estimate',       fareEstimate);
router.get('/drivers/nearby',      nearbyDriversMap);

// ── Auth-protected endpoints ──────────────────────────────────
router.post('/snap-to-roads', authMiddleware, snapRoads);

module.exports = router;
