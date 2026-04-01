const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Land = require('../models/Land');
const User = require('../models/User');
const Chat = require('../models/Chat');

// @desc    Get or create a 1-on-1 chat with another user
// @route   GET /api/chat/:userId
// @access  Private
const getOrCreateChat = async (req, res) => {
  try {
    const id = req.params.userId;
    const currentUserId = req.user.id;

    // 1. Try finding by Chat ID first (if it's a valid ID)
    let chat = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      chat = await Chat.findById(id).populate('participants', 'name profileImage email lastActive');
      if (chat) {
        // Ensure current user is a participant
        if (!chat.participants.some(p => p._id.toString() === currentUserId.toString())) {
          return res.status(403).json({ message: 'Not authorized to access this chat' });
        }
        return res.status(200).json(chat);
      }
    }

    // 2. Treat as Target User ID: find/create conversation
    const targetUserId = id;
    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'You cannot initiate a chat with yourself' });
    }

    // Verify target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    chat = await Chat.findOne({
      participants: { $all: [currentUserId, targetUserId] }
    }).populate('participants', 'name profileImage email lastActive');

    // If not exists, create new
    if (!chat) {
      chat = await Chat.create({
        participants: [currentUserId, targetUserId],
        messages: []
      });
      chat = await Chat.findById(chat._id).populate('participants', 'name profileImage email lastActive');
    }

    // Filter messages for current user if clearedAt exists
    const userClearedAt = (chat.clearedAt && chat.clearedAt.get(currentUserId)) || new Date(0);
    const filteredMessages = chat.messages.filter(m => new Date(m.timestamp) > userClearedAt);
    
    const chatObj = chat.toObject();
    chatObj.messages = filteredMessages;

    res.status(200).json(chatObj);
  } catch (error) {
    console.error("GET_OR_CREATE_CHAT_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to initiate chat', error: error.message });
  }
};

// @desc    Send a message in a 1-on-1 chat
// @route   POST /api/chat/message
// @access  Private
const sendChatMessage = async (req, res) => {
  try {
    const { chatId, text } = req.body;
    const senderId = req.user.id;

    if (!chatId || !text) {
      return res.status(400).json({ message: 'Missing chatId or message text' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Ensure sender is a participant (robust ID comparison)
    if (!chat.participants.some(p => p.toString() === senderId.toString())) {
      return res.status(403).json({ message: 'Not authorized to participate in this chat' });
    }

    const newMessage = {
      sender: senderId,
      text,
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    chat.lastMessage = { text, timestamp: new Date() };
    await chat.save();

    // Notify recipient (simplified)
    const recipientId = chat.participants.find(p => p.toString() !== senderId.toString());
    if (recipientId) {
       await Notification.create({
         user: recipientId,
         message: `New message from ${req.user.name}`,
         type: 'chat',
         link: `/chat/${chat._id}`
       });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("SEND_CHAT_MESSAGE_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to send message' });
  }
};

// @desc    Get all messages for a specific chat
// @route   GET /api/chat/messages/:chatId
// @access  Private
const getChatMessages = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const userId = req.user.id.toString();
    const userClearedAt = (chat.clearedAt && chat.clearedAt.get(userId)) || new Date(0);
    const filteredMessages = chat.messages.filter(m => new Date(m.timestamp) > userClearedAt);

    res.status(200).json(filteredMessages);
  } catch (error) {
    console.error("GET_CHAT_MESSAGES_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch messages' });
  }
};

// @desc    Get chat history for a land (Legacy Support)
// @route   GET /api/chat/:landId
// @access  Public (for demo) / Private
const getChatHistory = async (req, res) => {
  // Keeping this for backward compatibility if needed
  try {
    const messages = await Message.find({ landId: req.params.landId }).sort({ timestamp: 1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error("GET_CHAT_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch chat history' });
  }
};

// @desc    Post a new chat message (Legacy Support)
// @route   POST /api/chat/:landId
// @access  Public (for demo) / Private
const postMessage = async (req, res) => {
  // Keeping this for backward compatibility
  try {
    const { sender, text } = req.body;
    
    if (!sender || !sender.id || !sender.name || !text) {
      return res.status(400).json({ message: 'Please provide sender id, name and text' });
    }

    const message = await Message.create({
      sender,
      landId: req.params.landId,
      text
    });

    res.status(201).json(message);
  } catch (error) {
    console.error("POST_CHAT_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to save message' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id.toString();

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    let updated = false;
    chat.messages.forEach(m => {
      if (m.sender.toString() !== userId && !m.isRead) {
        m.isRead = true;
        updated = true;
      }
    });

    if (updated) {
      await chat.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Failed to mark as read' });
  }
};

const clearChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id.toString();

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (!chat.clearedAt) chat.clearedAt = new Map();
    chat.clearedAt.set(userId, new Date());
    
    await chat.save();
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Failed to clear chat' });
  }
};

const makeOffer = async (req, res) => {
  try {
    const { chatId, price, landId } = req.body;
    const senderId = req.user.id;

    if (!chatId || !price || !landId) {
      return res.status(400).json({ message: 'Missing required offer fields' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const newMessage = {
      sender: senderId,
      text: `Offer made for ₹${price}`,
      type: 'offer',
      offer: {
        price,
        status: 'pending',
        landId
      },
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    chat.lastMessage = { text: `New Offer: ₹${price}`, timestamp: new Date() };
    await chat.save();

    // Get the pushed message with its generated _id
    const savedMessage = chat.messages[chat.messages.length - 1];

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error("MAKE_OFFER_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to make offer' });
  }
};

const updateOfferStatus = async (req, res) => {
  try {
    const { chatId, messageId, status } = req.body;
    const userId = req.user.id;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const message = chat.messages.id(messageId);
    if (!message || message.type !== 'offer') {
      return res.status(404).json({ message: 'Offer message not found' });
    }

    // Optional: Ensure only the recipient of the offer can update its status
    // For now, allow both for flexibility, but usually seller accepts buyer's offer
    message.offer.status = status;
    chat.lastMessage = { text: `Offer ${status}: ₹${message.offer.price}`, timestamp: new Date() };
    
    await chat.save();
    res.status(200).json(message);
  } catch (error) {
    console.error("UPDATE_OFFER_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to update offer status' });
  }
};

module.exports = {
  getOrCreateChat,
  sendChatMessage,
  getChatMessages,
  getChatHistory,
  postMessage,
  markAsRead,
  clearChat,
  makeOffer,
  updateOfferStatus
};
