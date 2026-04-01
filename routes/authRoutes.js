const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, toggleWishlist, updateProfile, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/wishlist/:landId', protect, toggleWishlist);
router.put('/profile', protect, upload.single('profileImage'), updateProfile);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router;
