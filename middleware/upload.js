const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utils/cloudinary');

// Check if we are using placeholder Cloudinary keys
const isCloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

let storage;

if (isCloudinaryConfigured) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'land_marketplace',
      allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1000, crop: 'limit' }]
    }
  });
} else {
  // Fallback to memory storage if Cloudinary is not configured
  // This prevents the server from crashing or resetting the connection
  console.warn("WARNING: Cloudinary is not configured correctly. Using memory storage (images will NOT be saved permanently).");
  storage = multer.memoryStorage();
}

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

module.exports = upload;
