const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 120
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  type: {
    type: String,
    enum: [
      'chat',           // New chat messages
      'inquiry',        // New property inquiries
      'property_approved', // Property approvals
      'property_status',   // Property status updates (Available → Sold)
      'view_milestone',    // Property view milestones (50, 100, 500, 1000)
      'price_change',      // Price changes on saved properties
      'new_match',         // New properties matching user interests
      'promotion',         // Promotional announcements
      'offer',             // Limited-time offers / deal updates
      'account',           // Account and security updates
      'system'             // System announcements
    ],
    required: true
  },
  link: {
    type: String,
    default: '/notifications'
  },
  icon: {
    type: String,
    default: 'bell'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // For admin broadcasts — track the audience target
  broadcastId: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ═══ INDEXES ═══

// Primary query: user's notifications sorted by date, filtered by read status
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

// Unread count query (fast badge count)
notificationSchema.index({ user: 1, isRead: 1 });

// TTL index — auto-delete expired notifications (promotional, time-limited)
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

// Admin broadcast tracking
notificationSchema.index({ broadcastId: 1 }, { sparse: true });

module.exports = mongoose.model('Notification', notificationSchema);
