const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ★ In-memory user cache (60s TTL) — avoids hitting MongoDB on every authenticated request
const userCache = new Map(); // key: userId, value: { user, expiry }
const CACHE_TTL = 60 * 1000; // 60 seconds

function getCachedUser(userId) {
  const entry = userCache.get(userId);
  if (entry && Date.now() < entry.expiry) {
    return entry.user;
  }
  if (entry) userCache.delete(userId); // Expired
  return null;
}

function setCachedUser(userId, user) {
  userCache.set(userId, { user, expiry: Date.now() + CACHE_TTL });
  // Prevent memory leak: cap cache at 500 entries
  if (userCache.size > 500) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
}

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ★ Fast path: check cache first before hitting MongoDB
      const cached = getCachedUser(decoded.id);
      if (cached) {
        req.user = cached;
      } else {
        // Get user from the token and attach to request
        req.user = await User.findById(decoded.id).select('-password');
        if (req.user) {
          setCachedUser(decoded.id, req.user);
        }
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// @desc    Optional Auth - populates req.user if token exists, but doesn't block
const optionalProtect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ★ Use cache for optional auth too
      const cached = getCachedUser(decoded.id);
      if (cached) {
        req.user = cached;
      } else {
        req.user = await User.findById(decoded.id).select('-password');
        if (req.user) {
          setCachedUser(decoded.id, req.user);
        }
      }
    } catch (error) {
      // Just continue without user
      console.log("Optional Auth failed:", error.message);
    }
  }
  next();
};

module.exports = { protect, optionalProtect };
