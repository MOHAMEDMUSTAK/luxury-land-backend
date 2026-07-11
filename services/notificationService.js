const Notification = require('../models/Notification');
const User = require('../models/User');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@luxuryland.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️ Web Push is not configured. Missing VAPID keys in .env');
}

/**
 * ═══════════════════════════════════════════════════
 *  NOTIFICATION SERVICE
 *  Centralized notification creation + Socket.IO emission
 * ═══════════════════════════════════════════════════
 */

// Icon mapping for each notification type
const TYPE_ICONS = {
  chat: 'message-circle',
  inquiry: 'help-circle',
  property_approved: 'check-circle',
  property_status: 'home',
  view_milestone: 'eye',
  price_change: 'trending-down',
  new_match: 'star',
  promotion: 'megaphone',
  offer: 'tag',
  account: 'shield',
  system: 'bell'
};

/**
 * Create a notification and emit it via Socket.IO in real-time.
 * 
 * @param {Object} io - Socket.IO server instance
 * @param {Object} options
 * @param {String} options.userId - Target user ID
 * @param {String} options.type - Notification type (see enum)
 * @param {String} options.title - Notification title/headline
 * @param {String} options.message - Notification body text
 * @param {String} [options.link] - URL to navigate to on click
 * @param {String} [options.icon] - Icon override
 * @param {String} [options.priority] - 'low' | 'normal' | 'high' | 'urgent'
 * @param {Object} [options.metadata] - Extra data (propertyId, price, etc.)
 * @param {Date}   [options.expiresAt] - Auto-cleanup date
 * @returns {Object|null} Created notification or null if user opted out
 */
async function notify(io, options) {
  try {
    const {
      userId,
      type,
      title,
      message,
      link = '/notifications',
      icon,
      priority = 'normal',
      metadata = {},
      expiresAt = null
    } = options;

    if (!userId || !type || !title || !message) {
      console.error('NOTIFY_ERROR: Missing required fields', { userId, type, title });
      return null;
    }

    // Check user's notification preferences and get push subscriptions
    const user = await User.findById(userId).select('notificationPreferences pushSubscriptions').lean();
    if (user && user.notificationPreferences && user.notificationPreferences[type] === false) {
      // User has opted out of this notification type
      return null;
    }

    // Create the notification in the database
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
      icon: icon || TYPE_ICONS[type] || 'bell',
      priority,
      metadata,
      expiresAt
    });

    // Emit via Socket.IO for instant delivery
    if (io) {
      io.to(`user_${userId}`).emit('notification:new', {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        icon: notification.icon,
        priority: notification.priority,
        metadata: notification.metadata,
        isRead: false,
        createdAt: notification.createdAt
      });
    }

    // Send Web Push Notification
    if (user && user.pushSubscriptions && user.pushSubscriptions.length > 0 && process.env.VAPID_PUBLIC_KEY) {
      const payload = JSON.stringify({
        title,
        body: message,
        icon: icon || TYPE_ICONS[type] || 'bell',
        url: link
      });

      const removals = [];
      const promises = user.pushSubscriptions.map(sub => {
        return webpush.sendNotification(sub, payload).catch(error => {
          if (error.statusCode === 404 || error.statusCode === 410) {
            // Subscription has expired or is no longer valid
            console.log('Push subscription expired, marking for removal', sub.endpoint);
            removals.push(sub.endpoint);
          } else {
            console.error('Push notification error:', error);
          }
        });
      });

      await Promise.allSettled(promises);

      // Clean up expired subscriptions
      if (removals.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { pushSubscriptions: { endpoint: { $in: removals } } }
        });
      }
    }

    return notification;
  } catch (error) {
    console.error('NOTIFY_SERVICE_ERROR:', error.message);
    return null;
  }
}

/**
 * Broadcast a notification to a targeted audience.
 * Used by admins for announcements, promotions, etc.
 * 
 * @param {Object} io - Socket.IO server instance
 * @param {Object} options
 * @param {String} options.audience - 'all' | 'buyers' | 'sellers' | 'location' | 'category'
 * @param {String} [options.audienceFilter] - location name or category for targeted broadcasts
 * @param {String} options.type - Notification type
 * @param {String} options.title - Title
 * @param {String} options.message - Message body
 * @param {String} [options.link] - Action URL
 * @param {String} [options.priority] - Priority level
 * @param {Date}   [options.expiresAt] - Expiry
 * @returns {Object} { broadcastId, recipientCount }
 */
async function broadcastToAudience(io, options) {
  const {
    audience,
    audienceFilter,
    type = 'system',
    title,
    message,
    link = '/notifications',
    priority = 'normal',
    expiresAt = null
  } = options;

  // Build user query based on audience
  let userQuery = {};
  
  switch (audience) {
    case 'all':
      userQuery = {};
      break;
    case 'sellers':
      // Users who have at least one property listed
      const Land = require('../models/Land');
      const ownerIds = await Land.distinct('owner');
      userQuery = { _id: { $in: ownerIds } };
      break;
    case 'buyers':
      // Users who have items in wishlist (active buyers)
      userQuery = { 'wishlist.0': { $exists: true } };
      break;
    case 'location':
      if (audienceFilter) {
        userQuery = { location: { $regex: audienceFilter, $options: 'i' } };
      }
      break;
    case 'category':
      // Users who have wishlisted properties of this category
      if (audienceFilter) {
        const LandModel = require('../models/Land');
        const categoryLandIds = await LandModel.distinct('_id', { 
          propertyCategory: audienceFilter, 
          isActive: true 
        });
        const usersWithCategory = await User.distinct('_id', {
          wishlist: { $in: categoryLandIds }
        });
        userQuery = { _id: { $in: usersWithCategory } };
      }
      break;
    default:
      userQuery = {};
  }

  // Fetch target users with preferences and push subscriptions
  const users = await User.find(userQuery).select('_id notificationPreferences pushSubscriptions').lean();
  
  // Generate broadcast ID for tracking
  const broadcastId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const icon = TYPE_ICONS[type] || 'bell';

  // Batch create notifications
  const notifications = [];
  for (const user of users) {
    // Respect user preferences
    if (user.notificationPreferences && user.notificationPreferences[type] === false) {
      continue;
    }

    notifications.push({
      user: user._id,
      title,
      message,
      type,
      link,
      icon,
      priority,
      metadata: { audience, audienceFilter },
      broadcastId,
      expiresAt
    });
  }

  // Bulk insert for performance
  if (notifications.length > 0) {
    await Notification.insertMany(notifications, { ordered: false });
  }

  // Emit via Socket.IO to all targeted users
  if (io) {
    const notifPayload = {
      title,
      message,
      type,
      link,
      icon,
      priority,
      isRead: false,
      broadcastId,
      createdAt: new Date()
    };

    for (const user of users) {
      if (!user.notificationPreferences || user.notificationPreferences[type] !== false) {
        io.to(`user_${user._id}`).emit('notification:new', notifPayload);
      }
    }
  }

  // Send Web Push Notifications for broadcast
  if (process.env.VAPID_PUBLIC_KEY) {
    const payload = JSON.stringify({ title, body: message, icon, url: link });
    const allRemovals = {}; // { userId: [endpoints...] }
    const pushPromises = [];

    for (const user of users) {
      if (user.notificationPreferences && user.notificationPreferences[type] === false) continue;
      
      if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
        for (const sub of user.pushSubscriptions) {
          pushPromises.push(
            webpush.sendNotification(sub, payload).catch(error => {
              if (error.statusCode === 404 || error.statusCode === 410) {
                if (!allRemovals[user._id]) allRemovals[user._id] = [];
                allRemovals[user._id].push(sub.endpoint);
              }
            })
          );
        }
      }
    }

    await Promise.allSettled(pushPromises);

    // Bulk remove expired subscriptions
    const removalPromises = Object.keys(allRemovals).map(uid => 
      User.findByIdAndUpdate(uid, {
        $pull: { pushSubscriptions: { endpoint: { $in: allRemovals[uid] } } }
      })
    );
    if (removalPromises.length > 0) await Promise.all(removalPromises);
  }

  return {
    broadcastId,
    recipientCount: notifications.length,
    audience,
    audienceFilter: audienceFilter || null
  };
}

module.exports = { notify, broadcastToAudience };
