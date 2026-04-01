const User = require('../models/User');
const Land = require('../models/Land');

// @desc    Get user profile 
// @route   GET /api/users/:userId
// @access  Public
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password'); // Exclude password
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user listings
    const listings = await Land.find({ owner: user._id, isActive: true }).sort({ createdAt: -1 });
    
    // Get stats
    const totalListings = await Land.countDocuments({ owner: user._id });
    const activeListings = await Land.countDocuments({ owner: user._id, status: 'Available' });

    res.json({
      _id: user._id,
      name: user.name,
      profileImage: user.profileImage,
      location: user.location,
      joinedDate: user.createdAt,
      totalListings,
      activeListings,
      listings
    });
  } catch (error) {
    console.error("GET_USER_PROFILE_ERROR:", error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  getUserProfile
};
