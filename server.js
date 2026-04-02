require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

console.log("Using DB:", process.env.MONGO_URI);

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL
].filter(Boolean);

// Socket.io setup for real-time chat
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.error("Socket.io CORS BLOCKED for origin:", origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('A user connected to chat:', socket.id);

  // 1-on-1 Chat: Join private room by User ID
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their private room (${socket.id})`);
  });

  // 1-on-1 Chat: Send message to specific user
  socket.on('sendMessage', (data) => {
    // data: { recipientId, senderId, text, chatId, timestamp }
    const { recipientId } = data;
    if (recipientId) {
      io.to(`user_${recipientId}`).emit('receiveMessage', data);
      console.log(`Direct message emitted to user_${recipientId}`);
    }
  });

  // 1-on-1 Chat: Notify sender that messages were read
  socket.on('mark_read', (data) => {
    // data: { recipientId, senderId, chatId }
    const { senderId } = data;
    if (senderId) {
      io.to(`user_${senderId}`).emit('messages_read', data);
      console.log(`Read status notification emitted to user_${senderId}`);
    }
  });

  // 1-on-1 Chat: Update offer status (Accepted/Rejected)
  socket.on('update_offer_status', (data) => {
    // data: { recipientId, senderId, chatId, messageId, status }
    const { recipientId } = data;
    if (recipientId) {
      io.to(`user_${recipientId}`).emit('offer_status_updated', data);
      console.log(`Offer status update emitted to user_${recipientId}: ${data.status}`);
    }
  });

  // Legacy: Property-based room joining
  socket.on('join_room', (landId) => {
    socket.join(landId);
    console.log(`User mapped to land chat room: ${landId}`);
  });

  // Legacy: Property-based message sending
  socket.on('send_message', (data) => {
    io.to(data.landId).emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Middleware
app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.error("Express CORS BLOCKED for origin:", origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
  credentials: true
}));

const compression = require('compression');
app.use(compression());

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, 
  legacyHeaders: false, 
});
app.use('/api', limiter);

app.use(express.json());

// Global Cache headers for GET requests to cache static reads
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=30'); // Cache for 30 seconds
  }
  next();
});

// Mount routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/land', require('./routes/landRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Basic route for testing server
app.get('/', (req, res) => {
  res.send('Land Marketplace API is running with Socket.io...');
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB and start server AFTER connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });
