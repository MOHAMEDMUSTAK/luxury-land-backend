const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'offer'],
      default: 'text'
    },
    offer: {
      price: Number,
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
      },
      landId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Land'
      }
    },
    isRead: {
      type: Boolean,
      default: false
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  clearedAt: {
    type: Map,
    of: Date,
    default: {}
  },
  lastMessage: {
    text: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

// Index for finding chats between two users efficiently
chatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', chatSchema);
