const { getMockDB } = require('../config/database');

const connectedUsers = new Map();   // userId -> socketId
const connectedDrivers = new Map(); // driverId -> socketId

const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client terhubung: ${socket.id}`);

    // User/Driver join room
    socket.on('join', ({ userId, role }) => {
      socket.userId = userId;
      socket.role = role;
      connectedUsers.set(userId, socket.id);
      socket.join(`user_${userId}`);
      console.log(`[Socket.io] ${role} ${userId} bergabung`);
      socket.emit('joined', { message: 'Terhubung ke GONAB real-time server' });
    });

    // Driver update lokasi real-time
    socket.on('driver_location_update', ({ driverId, lat, lng, orderId }) => {
      const db = getMockDB();
      const driverIdx = db.drivers.findIndex(d => d.id === driverId);
      if (driverIdx !== -1) {
        db.drivers[driverIdx].current_lat = parseFloat(lat);
        db.drivers[driverIdx].current_lng = parseFloat(lng);
        db.drivers[driverIdx].location_updated_at = new Date().toISOString();
      }

      // Broadcast ke customer yang sedang dalam perjalanan
      if (orderId) {
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
          const customerSocketId = connectedUsers.get(order.user_id);
          if (customerSocketId) {
            io.to(`user_${order.user_id}`).emit('driver_location', { driverId, lat, lng, orderId });
          }
        }
      }
      
      // Broadcast ke admin
      io.to('admin_room').emit('driver_location', { driverId, lat, lng });
    });

    // Customer mencari driver
    socket.on('search_driver', ({ orderId, userId }) => {
      const db = getMockDB();
      const order = db.orders.find(o => o.id === orderId);
      if (order && order.driver_id) {
        const driverSocket = connectedUsers.get(order.driver_id);
        if (driverSocket) {
          io.to(`user_${order.driver_id}`).emit('new_order', { order });
        }
        socket.emit('driver_found', { message: 'Driver ditemukan, menunggu konfirmasi...' });
      } else {
        socket.emit('no_driver', { message: 'Sedang mencari driver terdekat...' });
      }
    });

    // Driver accept/reject order
    socket.on('driver_response', ({ orderId, driverId, response }) => {
      const db = getMockDB();
      const orderIdx = db.orders.findIndex(o => o.id === orderId);
      if (orderIdx !== -1) {
        if (response === 'accept') {
          db.orders[orderIdx].status = 'accepted';
          io.to(`user_${db.orders[orderIdx].user_id}`).emit('order_accepted', {
            orderId, message: 'Driver menerima pesanan Anda! Segera menuju titik jemput.'
          });
        } else {
          db.orders[orderIdx].status = 'searching';
          io.to(`user_${db.orders[orderIdx].user_id}`).emit('driver_rejected', {
            orderId, message: 'Driver tidak tersedia, mencari driver lain...'
          });
        }
      }
    });

    // Order status update (broadcast ke customer)
    socket.on('order_status_update', ({ orderId, status, message }) => {
      const db = getMockDB();
      const order = db.orders.find(o => o.id === orderId);
      if (order) {
        io.to(`user_${order.user_id}`).emit('order_update', { orderId, status, message });
        io.to('admin_room').emit('order_update', { orderId, status, user_id: order.user_id });
      }
    });

    // Chat message antara customer dan driver
    socket.on('send_message', ({ orderId, senderId, senderRole, message }) => {
      const db = getMockDB();
      const order = db.orders.find(o => o.id === orderId);
      if (!order) return;

      const chatMsg = {
        id: require('uuid').v4(),
        order_id: orderId,
        sender_id: senderId,
        sender_role: senderRole,
        message,
        sent_at: new Date().toISOString()
      };
      db.chats.push(chatMsg);

      // Kirim ke pihak lain
      if (senderRole === 'customer' && order.driver_id) {
        io.to(`user_${order.driver_id}`).emit('new_message', chatMsg);
      } else if (senderRole === 'driver') {
        io.to(`user_${order.user_id}`).emit('new_message', chatMsg);
      }
      
      // Konfirmasi ke pengirim
      socket.emit('message_sent', chatMsg);
    });

    // SOS Alert
    socket.on('sos_alert', ({ orderId, userId, lat, lng }) => {
      console.log(`🚨 SOS DARURAT dari user ${userId} di order ${orderId}`);
      io.to('admin_room').emit('sos_alert', {
        orderId, userId, lat, lng,
        message: `🚨 DARURAT! Pengguna membutuhkan bantuan segera!`,
        timestamp: new Date().toISOString()
      });
    });

    // Admin join special room
    socket.on('admin_join', () => {
      socket.join('admin_room');
      console.log(`[Socket.io] Admin bergabung ke admin_room`);
    });

    // Driver toggle online/offline
    socket.on('driver_toggle_online', ({ driverId, isOnline }) => {
      const db = getMockDB();
      const driverIdx = db.drivers.findIndex(d => d.id === driverId);
      if (driverIdx !== -1) {
        db.drivers[driverIdx].is_online = isOnline;
        io.to('admin_room').emit('driver_status_change', { driverId, isOnline });
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        console.log(`[Socket.io] Client ${socket.userId} terputus`);
      }
    });
  });
};

module.exports = { setupSocket, connectedUsers };
