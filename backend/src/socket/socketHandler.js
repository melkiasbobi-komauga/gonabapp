/**
 * socketHandler.js
 * Real-time events via Socket.io – fully PostgreSQL backed
 * Events handled:
 *   join                  – user/driver join personal room
 *   admin_join            – admin joins admin_room
 *   driver_location_update – driver broadcasts GPS position
 *   driver_toggle_online  – driver goes online/offline
 *   search_driver         – customer looking for driver
 *   driver_response       – driver accept/reject order
 *   order_status_update   – generic status push
 *   send_message          – in-app chat (persisted to DB)
 *   sos_alert             – emergency SOS
 */

'use strict';

const { query } = require('../config/database');

const connectedUsers   = new Map();  // userId   → socketId
const connectedDrivers = new Map();  // driverId → socketId

const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client terhubung: ${socket.id}`);

    // ── join ────────────────────────────────────────────────
    socket.on('join', ({ userId, role }) => {
      if (!userId) return;
      socket.userId = userId;
      socket.role   = role;
      connectedUsers.set(userId, socket.id);
      socket.join(`user_${userId}`);
      console.log(`[Socket.io] ${role || 'user'} ${userId} bergabung`);
      socket.emit('joined', { message: 'Terhubung ke GONAB real-time server' });
    });

    // ── admin_join ───────────────────────────────────────────
    socket.on('admin_join', ({ userId } = {}) => {
      socket.join('admin_room');
      if (userId) { socket.userId = userId; connectedUsers.set(userId, socket.id); }
      console.log(`[Socket.io] Admin bergabung ke admin_room`);
    });

    // ── driver_location_update ───────────────────────────────
    socket.on('driver_location_update', async ({ driverId, lat, lng, orderId }) => {
      if (!driverId || !lat || !lng) return;
      try {
        // Persist ke PostgreSQL + PostGIS
        await query(
          `UPDATE drivers
           SET location = ST_SetSRID(ST_MakePoint($1,$2),4326),
               location_updated_at = NOW()
           WHERE id = $3`,
          [parseFloat(lng), parseFloat(lat), driverId]
        );
      } catch (e) { /* non-fatal */ }

      // Broadcast ke customer yang memesan driver ini
      if (orderId) {
        try {
          const { rows } = await query(
            `SELECT user_id FROM orders WHERE id=$1`, [orderId]);
          if (rows.length) {
            io.to(`user_${rows[0].user_id}`).emit('driver_location', { driverId, lat, lng, orderId });
          }
        } catch (e) { /* non-fatal */ }
      }

      // Broadcast ke admin map
      io.to('admin_room').emit('driver_location', { driverId, lat, lng });
    });

    // ── driver_toggle_online ─────────────────────────────────
    socket.on('driver_toggle_online', async ({ driverId, isOnline }) => {
      if (!driverId) return;
      try {
        await query(
          `UPDATE drivers SET is_online=$1 WHERE id=$2`, [!!isOnline, driverId]);
      } catch (e) { /* non-fatal */ }
      io.to('admin_room').emit('driver_status_change', { driverId, isOnline: !!isOnline });
    });

    // ── search_driver ────────────────────────────────────────
    socket.on('search_driver', async ({ orderId, userId }) => {
      if (!orderId) return;
      try {
        const { rows } = await query(
          `SELECT o.*, d.user_id AS driver_user_id
           FROM orders o
           LEFT JOIN drivers d ON d.id=o.driver_id
           WHERE o.id=$1`, [orderId]);
        if (!rows.length) return;
        const order = rows[0];

        if (order.driver_id && order.driver_user_id) {
          io.to(`user_${order.driver_user_id}`).emit('new_order', { order });
          socket.emit('driver_found', { message: 'Driver ditemukan, menunggu konfirmasi...' });
        } else {
          socket.emit('no_driver', { message: 'Sedang mencari driver terdekat...' });
        }
      } catch (e) {
        socket.emit('no_driver', { message: 'Sedang mencari driver terdekat...' });
      }
    });

    // ── driver_response ──────────────────────────────────────
    socket.on('driver_response', async ({ orderId, driverId, response }) => {
      if (!orderId) return;
      try {
        const newStatus = response === 'accept' ? 'accepted' : 'searching';
        const { rows } = await query(
          `UPDATE orders SET status=$1 WHERE id=$2 RETURNING user_id, status`,
          [newStatus, orderId]
        );
        if (!rows.length) return;
        const userId = rows[0].user_id;

        if (response === 'accept') {
          io.to(`user_${userId}`).emit('order_accepted', {
            orderId, message: 'Driver menerima pesanan Anda! Segera menuju titik jemput.'
          });
        } else {
          io.to(`user_${userId}`).emit('driver_rejected', {
            orderId, message: 'Driver tidak tersedia, mencari driver lain...'
          });
        }
        io.to('admin_room').emit('order_update', { orderId, status: newStatus, user_id: userId });
      } catch (e) { /* non-fatal */ }
    });

    // ── order_status_update ──────────────────────────────────
    socket.on('order_status_update', async ({ orderId, status, message }) => {
      if (!orderId || !status) return;
      try {
        const { rows } = await query(
          `SELECT user_id FROM orders WHERE id=$1`, [orderId]);
        if (!rows.length) return;
        const userId = rows[0].user_id;
        io.to(`user_${userId}`).emit('order_update', { orderId, status, message });
        io.to('admin_room').emit('order_update', { orderId, status, user_id: userId });
      } catch (e) { /* non-fatal */ }
    });

    // ── send_message ─────────────────────────────────────────
    socket.on('send_message', async ({ orderId, senderId, senderRole, message }) => {
      if (!orderId || !senderId || !message) return;
      try {
        const { v4: uuidv4 } = require('uuid');
        const msgId = uuidv4();

        // Ambil data order
        const { rows } = await query(
          `SELECT o.user_id, d.user_id AS driver_user_id
           FROM orders o
           LEFT JOIN drivers d ON d.id=o.driver_id
           WHERE o.id=$1`, [orderId]);
        if (!rows.length) return;
        const order = rows[0];

        // Persist ke DB
        await query(
          `INSERT INTO chats(id,order_id,sender_id,sender_role,message)
           VALUES($1,$2,$3,$4,$5)`,
          [msgId, orderId, senderId, senderRole, message]
        );

        const chatMsg = { id: msgId, order_id: orderId, sender_id: senderId, senderRole, message, sent_at: new Date().toISOString() };

        // Kirim ke pihak lain
        if (senderRole === 'customer' && order.driver_user_id) {
          io.to(`user_${order.driver_user_id}`).emit('new_message', chatMsg);
        } else if (senderRole === 'driver') {
          io.to(`user_${order.user_id}`).emit('new_message', chatMsg);
        }
        socket.emit('message_sent', chatMsg);
      } catch (e) {
        socket.emit('message_error', { message: 'Gagal mengirim pesan' });
      }
    });

    // ── sos_alert ────────────────────────────────────────────
    socket.on('sos_alert', async ({ orderId, userId, lat, lng, notes }) => {
      console.log(`🚨 SOS dari user ${userId} di order ${orderId}`);
      try {
        if (orderId) {
          await query(
            `UPDATE orders SET sos_activated=TRUE, sos_at=NOW() WHERE id=$1`,
            [orderId]
          );
        }
      } catch (e) { /* non-fatal */ }
      io.to('admin_room').emit('sos_alert', {
        orderId, userId, lat, lng,
        message  : '🚨 DARURAT! Pengguna membutuhkan bantuan segera!',
        timestamp: new Date().toISOString()
      });
    });

    // ── disconnect ───────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        console.log(`[Socket.io] Client ${socket.userId} terputus`);
      }
    });
  });
};

module.exports = { setupSocket, connectedUsers };
