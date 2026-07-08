const express = require('express');
const router = express.Router();
const { 
  getOrCreateChat, 
  sendChatMessage, 
  getChatMessages, 
  getChatHistory, 
  postMessage,
  markAsRead,
  clearChat,
  makeOffer,
  updateOfferStatus
} = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

// 1-on-1 Chat Routes
router.get('/:userId', protect, getOrCreateChat);
router.get('/messages/:chatId', protect, getChatMessages);
router.post('/message', protect, sendChatMessage);
router.patch('/mark-as-read/:chatId', protect, markAsRead);
router.delete('/clear/:chatId', protect, clearChat);
router.post('/offer', protect, makeOffer);
router.patch('/offer-status', protect, updateOfferStatus);

// Legacy/Property-based Chat Routes
router.route('/property/:landId')
  .get(getChatHistory)
  .post(postMessage);

module.exports = router;
