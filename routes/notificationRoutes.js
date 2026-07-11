const express = require('express');
const router = express.Router();
const { 
  getNotifications, 
  getUnreadCount,
  markAsRead, 
  markAllAsRead, 
  deleteNotification,
  clearNotifications,
  subscribeToPush,
  unsubscribeFromPush,
  adminBroadcast,
  adminBroadcastHistory
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { adminProtect } = require('../middleware/adminAuth');

// ═══ User Routes ═══
router.get('/', protect, getNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.patch('/read-all', protect, markAllAsRead);
router.delete('/clear-all', protect, clearNotifications);
router.patch('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteNotification);

// ═══ Push Subscription Routes ═══
router.post('/push/subscribe', protect, subscribeToPush);
router.post('/push/unsubscribe', protect, unsubscribeFromPush);

// ═══ Admin Routes ═══
router.post('/admin/broadcast', protect, adminProtect, adminBroadcast);
router.get('/admin/history', protect, adminProtect, adminBroadcastHistory);

// ═══ TEMPORARY TEST ROUTE ═══
// Visit http://localhost:5000/api/notifications/test/broadcast-all in your browser to test
router.get('/test/broadcast-all', async (req, res) => {
  try {
    const { broadcastToAudience } = require('../services/notificationService');
    const io = req.app.get('io');
    const result = await broadcastToAudience(io, {
      audience: 'all',
      type: 'promotion',
      title: '🚨 Test Broadcast to All!',
      message: 'This is a test notification sent to every user in the database.',
      priority: 'high'
    });
    res.json({ message: 'Broadcast successful!', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
