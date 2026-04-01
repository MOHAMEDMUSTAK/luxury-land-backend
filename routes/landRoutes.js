const express = require('express');
const router = express.Router();
const {
  getLands,
  getLandById,
  addLand,
  updateLand,
  deleteLand,
  getOwnerLands,
  toggleActive,
  getRecommendedLands,
  addReview,
  getSimilarProperties,
  getRecentlyViewed,
  clearRecentlyViewed
} = require('../controllers/landController');
const { protect, optionalProtect } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.get('/', getLands);
router.get('/search', getLands);
router.get('/recommended', getRecommendedLands);
router.get('/:id/similar', getSimilarProperties);

// Protected routes (Specific resources first)
router.get('/my-lands', protect, getOwnerLands);
router.get('/recently-viewed', protect, getRecentlyViewed);
router.delete('/recently-viewed', protect, clearRecentlyViewed);
router.patch('/:id/toggle-active', protect, toggleActive);

// Dynamic ID route (Catch-all for IDs)
router.post('/:id/reviews', protect, addReview);
router.get('/:id', optionalProtect, getLandById);

// Error handling for initial multer upload
const handleUpload = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      console.error("MULTER_UPLOAD_ERROR:", err);
      return res.status(500).json({ 
        message: 'Image upload failed', 
        error: err.message,
        hint: "Verify your Cloudinary credentials in .env" 
      });
    }
    next();
  });
};

// Protected route to add a new land, with image upload handled separately
router.post('/', protect, handleUpload, addLand);

// Protected routes to update and delete a land by ID
router.put('/:id', protect, handleUpload, updateLand);
router.delete('/:id', protect, deleteLand);

module.exports = router;
