const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
  landId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Land',
    required: true,
    index: true
  },
  viewerIdentifier: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800 // 30 minutes in seconds
  }
});

// Ensure unique index for (landId + viewerIdentifier) within the 30-minute window
viewSchema.index({ landId: 1, viewerIdentifier: 1 }, { unique: true });

module.exports = mongoose.model('View', viewSchema);
