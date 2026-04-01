const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.status(200).json(notifications);
  } catch (error) {
    console.error("GET_NOTIFICATIONS_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch notifications' });
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

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearNotifications
};
