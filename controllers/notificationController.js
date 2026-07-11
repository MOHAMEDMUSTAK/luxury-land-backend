const Notification = require('../models/Notification');
const { notify, broadcastToAudience } = require('../services/notificationService');

/**
 * ═══════════════════════════════════════════════════
 *  NOTIFICATION CONTROLLER
 *  Full CRUD + Admin Broadcast endpoints
 * ═══════════════════════════════════════════════════
 */

// @desc    Get user notifications (paginated, filterable)
// @route   GET /api/notifications?filter=unread&page=1&limit=20
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const { filter, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { user: req.user.id };

    // Filter by read status
    if (filter === 'unread') {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user.id, isRead: false })
    ]);

    res.status(200).json({
      notifications,
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      hasMore: skip + notifications.length < total
    });
  } catch (error) {
    console.error("GET_NOTIFICATIONS_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch notifications' });
  }
};

// @desc    Get unread notification count (lightweight — for badge)
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      user: req.user.id, 
      isRead: false 
    });
    res.status(200).json({ count });
  } catch (error) {
    console.error("UNREAD_COUNT_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Mark individual notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    console.error("MARK_READ_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to mark notification' });
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error("MARK_ALL_READ_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to mark all notifications' });
  }
};

// @desc    Delete a single notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    await notification.deleteOne();
    res.status(200).json({ message: 'Notification deleted', id: req.params.id });
  } catch (error) {
    console.error("DELETE_NOTIFICATION_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to delete notification' });
  }
};

// @desc    Clear all notifications (Delete history)
// @route   DELETE /api/notifications/clear-all
// @access  Private
const clearNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id });
    res.status(200).json({ message: 'Notification history cleared' });
  } catch (error) {
    console.error("CLEAR_NOTIFICATIONS_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to clear history' });
  }
};

// ═══════════════════════════════════════════
//  PUSH NOTIFICATION ENDPOINTS
// ═══════════════════════════════════════════

// @desc    Subscribe to Web Push Notifications
// @route   POST /api/notifications/push/subscribe
// @access  Private
const subscribeToPush = async (req, res) => {
  try {
    const subscription = req.body;
    
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'Invalid subscription object. Requires endpoint and keys.' });
    }

    const User = require('../models/User');
    
    // First remove any existing subscription with the same endpoint
    // (handles re-registrations when browser regenerates subscription keys)
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } }
    );

    // Then add the fresh subscription
    await User.updateOne(
      { _id: req.user.id },
      { 
        $push: { 
          pushSubscriptions: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth
            }
          } 
        } 
      }
    );

    console.log(`[PUSH] User ${req.user.id} subscribed: ${subscription.endpoint.slice(-20)}`);
    res.status(201).json({ message: 'Push subscription saved successfully' });
  } catch (error) {
    console.error("PUSH_SUBSCRIBE_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to subscribe' });
  }
};

// @desc    Unsubscribe from Web Push Notifications
// @route   POST /api/notifications/push/unsubscribe
// @access  Private
const unsubscribeFromPush = async (req, res) => {
  try {
    const { endpoint } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint is required' });
    }

    const User = require('../models/User');
    
    // Remove the specific subscription
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { pushSubscriptions: { endpoint } } }
    );

    res.status(200).json({ message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error("PUSH_UNSUBSCRIBE_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to unsubscribe' });
  }
};

// ═══════════════════════════════════════════
//  ADMIN ENDPOINTS
// ═══════════════════════════════════════════

// @desc    Admin: Broadcast notification to targeted audience
// @route   POST /api/notifications/admin/broadcast
// @access  Private + Admin
const adminBroadcast = async (req, res) => {
  try {
    const { audience, audienceFilter, type, title, message, link, priority, expiresAt } = req.body;

    if (!audience || !title || !message) {
      return res.status(400).json({ 
        message: 'Missing required fields: audience, title, message' 
      });
    }

    const validAudiences = ['all', 'buyers', 'sellers', 'location', 'category'];
    if (!validAudiences.includes(audience)) {
      return res.status(400).json({ 
        message: `Invalid audience. Must be one of: ${validAudiences.join(', ')}` 
      });
    }

    const io = req.app.get('io');
    const result = await broadcastToAudience(io, {
      audience,
      audienceFilter,
      type: type || 'system',
      title,
      message,
      link: link || '/notifications',
      priority: priority || 'normal',
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    res.status(201).json({
      message: 'Broadcast sent successfully',
      ...result
    });
  } catch (error) {
    console.error("ADMIN_BROADCAST_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to send broadcast' });
  }
};

// @desc    Admin: Get broadcast history
// @route   GET /api/notifications/admin/history
// @access  Private + Admin
const adminBroadcastHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get distinct broadcasts with aggregation
    const broadcasts = await Notification.aggregate([
      { $match: { broadcastId: { $ne: null } } },
      { $group: {
        _id: '$broadcastId',
        title: { $first: '$title' },
        message: { $first: '$message' },
        type: { $first: '$type' },
        link: { $first: '$link' },
        priority: { $first: '$priority' },
        audience: { $first: '$metadata.audience' },
        audienceFilter: { $first: '$metadata.audienceFilter' },
        recipientCount: { $sum: 1 },
        readCount: { $sum: { $cond: ['$isRead', 1, 0] } },
        createdAt: { $first: '$createdAt' }
      }},
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    res.status(200).json(broadcasts);
  } catch (error) {
    console.error("ADMIN_HISTORY_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch broadcast history' });
  }
};

module.exports = {
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
};
