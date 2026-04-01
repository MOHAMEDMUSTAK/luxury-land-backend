const User = require('../models/User');
const Land = require('../models/Land');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please add all fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password
    });

    if (user) {
      // Send Welcome Email if preference is enabled
      if (user.emailNotifications) {
        try {
          await sendEmail({
            email: user.email,
            subject: 'Welcome to Land Marketplace!',
            message: `Hi ${user.name},\n\nWelcome to Luxury Land Marketplace! We are thrilled to have you join our exclusive platform for premium land transactions.\n\nStart exploring now: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/marketplace\n\nBest regards,\nThe Land Marketplace Team`
          });
        } catch (emailError) {
          console.error("WELCOME_EMAIL_ERROR:", emailError.message);
        }
      }

      res.status(201).json({
        message: 'Account created successfully. Please login.',
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.matchPassword(password))) {
      user.lastActive = new Date();
      await user.save();
      
      res.json({
        id: user._id,
        _id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        location: user.location || '',
        profileImage: user.profileImage || '',
        wishlist: user.wishlist || [],
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Toggle item in wishlist
// @route   POST /api/auth/wishlist/:landId
// @access  Public (for demo purposes)
const toggleWishlist = async (req, res) => {
  try {
    // Secure: Use req.user instead of req.body.userId
    const userId = req.user._id;
    const landId = req.params.landId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // FIX: Type mismatch fix (ObjectId vs String) using .some and .toString()
    const isWishlisted = user.wishlist.some(id => id.toString() === landId);
    
    if (isWishlisted) {
      // Atomic Unsave
      await User.findByIdAndUpdate(userId, { $pull: { wishlist: landId } });
    } else {
      // Atomic Save
      await User.findByIdAndUpdate(userId, { $addToSet: { wishlist: landId } });
      
      // Create Notification for Land Owner
      try {
        const land = await Land.findById(landId);
        if (land && land.owner && land.owner.toString() !== userId.toString()) {
          await Notification.create({
            user: land.owner,
            message: `Someone just added your property "${land.title || 'listing'}" to their wishlist!`,
            type: 'wishlist',
            link: `/property/${landId}`
          });
        }
      } catch (err) {
        console.error("WISHLIST_NOTIFICATION_ERROR:", err.message);
      }
    }

    // Sync wishlistCount on Land model (Recalculate for 100% accuracy)
    try {
      const count = await User.countDocuments({ wishlist: landId });
      await Land.findByIdAndUpdate(landId, { wishlistCount: count });
    } catch (syncError) {
      console.error("WISHLIST_COUNT_SYNC_ERROR:", syncError.message);
    }

    // Fetch updated wishlist to return to frontend
    const updatedUser = await User.findById(userId).select('wishlist');
    return res.status(200).json({ wishlist: updatedUser.wishlist || [] });
  } catch (error) {
    console.error("TOGGLE_WISHLIST_ERROR:", error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = req.body.name || user.name;
    user.phone = req.body.phone || user.phone;
    user.location = req.body.location || user.location;

    if (req.file) {
      console.log("PROFILE_IMAGE_UPLOADED:", {
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      // Ensure we have a path (Cloudinary) or fallback
      user.profileImage = req.file.path || user.profileImage;
    } else {
      console.log("PROFILE_UPDATE: No new image uploaded.");
    }

    const updatedUser = await user.save();

    res.json({
      id: updatedUser._id, // Add normalized 'id' for frontend
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      location: updatedUser.location,
      profileImage: updatedUser.profileImage,
      token: generateToken(updatedUser._id),
      wishlist: updatedUser.wishlist || []
    });
  } catch (error) {
    console.error("UPDATE_PROFILE_ERROR:", error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash and set to resetToken field
    user.resetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set token expiry (10 mins)
    user.resetTokenExpiry = Date.now() + 10 * 60 * 1000;

    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please click on the link below or paste it into your browser to complete the process:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nThis link is valid for 10 minutes.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        message
      });

      res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
      console.error("FORGOT_PASSWORD_EMAIL_ERROR:", err);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();

      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR:", error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    // Get hashed token
    const resetToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetToken,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Set new password
    user.password = req.body.password;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      data: 'Password reset successful'
    });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR:", error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      id: user._id,
      _id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      location: user.location || '',
      profileImage: user.profileImage || '',
      wishlist: user.wishlist || []
    });
  } catch (error) {
    console.error("GET_ME_ERROR:", error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  toggleWishlist,
  updateProfile,
  forgotPassword,
  resetPassword,
  getMe
};
