const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }
  },
  landId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Land',
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('Message', messageSchema);
