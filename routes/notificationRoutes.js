const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, clearNotifications } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getNotifications);
router.patch('/read-all', protect, markAllAsRead);
router.delete('/clear-all', protect, clearNotifications);
router.patch('/:id/read', protect, markAsRead);

module.exports = router;
