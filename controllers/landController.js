const Land = require('../models/Land');
const Notification = require('../models/Notification');
const User = require('../models/User');
const View = require('../models/View');

// Helper to calculate sq ft value for any unit
const getSqftValue = (value, unit) => {
  if (!value) return 0;
  const num = parseFloat(value);
  switch (unit) {
    case 'acres': return num * 43560;
    case 'cents': return num * 435.6;
    case 'sqm': return num * 10.7639;
    default: return num; // Default sq ft
  }
};

// @desc    Fetch all lands
// @route   GET /api/land
// @access  Public
// @desc    Fetch all lands
// @route   GET /api/land
// @access  Public
const getLands = async (req, res) => {
  try {
    const { 
      search, 
      state, district, town, area, 
      minPrice, maxPrice, minSize, maxSize, 
      listingType, propertyCategory, isActive, type,
      sortBy,
      lat, lng, maxDistance = 50000,
      page = 1,
      limit = 12
    } = req.query;

    let query = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Optimized Smart Search using Text Index
    if (search) {
      query.$text = { $search: search };
    } else {
      // Direct filters
      if (state) query.state = { $regex: state, $options: 'i' };
      if (district) query.district = { $regex: district, $options: 'i' };
      if (town) query.town = { $regex: town, $options: 'i' };
      if (area) query.area = { $regex: area, $options: 'i' };
    }

    // Range Filters
    const isRent = listingType === 'rent';
    const priceField = isRent ? 'rentPerMonth' : 'price';

    if (minPrice || maxPrice) {
      query[priceField] = {};
      if (minPrice) query[priceField].$gte = Number(minPrice);
      if (maxPrice) query[priceField].$lte = Number(maxPrice);
    }
    
    // Size Filter
    if (minSize || maxSize) {
      const unit = req.query.sizeUnitFilter || 'sq ft';
      query.sizeInSqft = {};
      if (minSize) query.sizeInSqft.$gte = getSqftValue(minSize, unit);
      if (maxSize) query.sizeInSqft.$lte = getSqftValue(maxSize, unit);
    }
    
    if (listingType) query.listingType = listingType;
    if (propertyCategory) query.propertyCategory = propertyCategory;
    if (type) query.type = type;
    if (req.query.landType) query.landType = req.query.landType;
    
    // Active only by default
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      query.isActive = true; 
    }

    // Sorting
    let sort = { createdAt: -1 };
    if (search) {
      // Sort by relevance if searching
      sort = { score: { $meta: "textScore" } };
    } else if (sortBy === 'price_asc') sort = { [priceField]: 1 };
    else if (sortBy === 'price_desc') sort = { [priceField]: -1 };
    else if (sortBy === 'popular') sort = { views: -1 };

    if (lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      };
    }

    // Optimized Data Fetching:
    // 1. Projection: Only fetch what's needed for the card
    // 2. Pagination: Use skip/limit
    const total = await Land.countDocuments(query);
    const lands = await Land.find(query)
      .select('title images town state propertyCategory listingType size sizeUnit landType price rentPerMonth createdAt averageRating reviewCount status owner')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
      .populate('owner', 'name profileImage');

    res.status(200).json({
      success: true,
      count: lands.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: lands
    });
  } catch (error) {
    console.error("GET_LANDS_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error: Failed to fetch lands', error: error.message });
  }
};

// @desc    Get single land details
// @route   GET /api/land/:id
// @access  Public
const getLandById = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id).populate('owner', 'name email profileImage');
    if (!land) return res.status(404).json({ message: 'Land not found' });

    // Increment views uniquely (30-min window)
    try {
      const viewerIdentifier = req.user ? req.user._id.toString() : (req.ip || req.headers['x-forwarded-for'] || 'guest');
      
      // Try to create a unique view record (will fail if viewed within 30 mins due to unique index)
      const isNewView = await View.create({ 
        landId: req.params.id, 
        viewerIdentifier 
      }).catch(() => null); // Ignore E11000 duplicate key error

      if (isNewView) {
        await Land.findByIdAndUpdate(req.params.id, { $inc: { views: 1, viewCount: 1 } });
      }
    } catch (viewError) {
      console.error("VIEW_TRACKING_ERROR:", viewError.message);
    }

    // Track Recently Viewed (If authenticated)
    if (req.user) {
      try {
        const user = await User.findById(req.user._id);
        if (user) {
          // Initialize if missing (for legacy users)
          if (!user.recentlyViewed) user.recentlyViewed = [];
          
          // Remove if already exists (to move it to top and update timestamp)
          user.recentlyViewed = user.recentlyViewed.filter(item => 
            item.propertyId && item.propertyId.toString() !== land._id.toString()
          );
          
          // Push to front with new timestamp
          user.recentlyViewed.unshift({ propertyId: land._id, viewedAt: new Date() });
          
          // Keep only last 5 (Smart Limit)
          user.recentlyViewed = user.recentlyViewed.slice(0, 5);
          await user.save();
        }
      } catch (err) {
        console.error("RECENTLY_VIEWED_TRACK_ERROR:", err.message);
      }
    }

    res.json(land);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const addLand = async (req, res) => {
  try {
    console.log("--- ADD LAND REQUEST RECEIVED ---");
    console.log("BODY:", JSON.stringify(req.body, null, 2));
    console.log("FILES:", req.files ? req.files.length : 'None');
    console.log("USER:", req.user ? req.user.id || req.user._id : 'NONE');

    const { 
      title, price, description, 
      state, district, town, area, 
      size, sizeUnit, landType, listingType, 
      lat, lng, ownerPhone, type, status,
      propertyCategory, rentPerMonth, advance 
    } = req.body;
    
    // 1. Mandatory Text Validation
    const required = ['title', 'description', 'state', 'district', 'town', 'size', 'listingType', 'propertyCategory'];
    
    // Conditional requirements
    if (listingType === 'sale' && !price) required.push('price');
    if (listingType === 'rent' && !rentPerMonth) required.push('rentPerMonth');

    const missing = required.filter(field => !req.body[field] || req.body[field] === 'undefined' || req.body[field] === 'null');
    
    if (missing.length > 0) {
       console.log("MISSING_FIELDS_REJECTED:", missing);
       return res.status(400).json({ 
         success: false,
         message: `Required data is missing: ${missing.join(', ')}`,
         missing 
       });
    }

    // --- AUTO DESCRIPTION ENHANCER ---
    let enhancedDescription = description;
    if (!description || description.trim().length < 15) {
      const category = propertyCategory || 'land';
      const sizeStr = `${size} ${sizeUnit || 'sq ft'}`;
      if (category === 'house') {
        enhancedDescription = `Stunning ${sizeStr} premium property offering a perfect blend of comfort and style. Located in the peaceful area of ${town}, it is an ideal choice for residential living and long-term investment.`;
      } else if (category === 'shop' || category === 'commercial') {
        enhancedDescription = `Highly visible ${sizeStr} commercial space in the heart of ${town}. Perfect for retail or business operations with excellent connectivity and high ROI potential.`;
      } else {
        enhancedDescription = `Prime ${sizeStr} agricultural/residential land located in ${town}, ${district}. This peaceful plot offers direct access, fertile soil, and is perfect for farming, layout development, or a secure future investment.`;
      }
    }
    
    // 2. Process image URLs (Optional)
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      console.log("UPLOADED_FILES_COUNT:", req.files.length);
      req.files.forEach((file, i) => {
        console.log(`  FILE[${i}]:`, { 
          originalname: file.originalname, 
          path: file.path, 
          size: file.size,
          mimetype: file.mimetype 
        });
      });
      imageUrls = req.files
        .filter(file => file.path) // Only include files with real Cloudinary URLs
        .map(file => file.path);
      console.log("SAVED_IMAGE_URLS:", imageUrls);
    } else if (req.body.images && Array.isArray(req.body.images)) {
      // Fallback if images were sent as URLs directly (e.g. re-listing)
      imageUrls = req.body.images;
    } else {
      console.log("NO_FILES_UPLOADED: req.files is", req.files);
    }

    // 3. Location Handling (Optional)
    let locationObject = undefined;
    if (lat && lng && lat !== 'null' && lng !== 'null') {
      locationObject = {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)]
      };
    }

    // 4. Create Land Entry
    const land = await Land.create({
      title,
      price: listingType === 'sale' ? Number(price) : undefined,
      rentPerMonth: listingType === 'rent' ? Number(rentPerMonth) : undefined,
      advance: advance ? Number(advance) : undefined,
      description: enhancedDescription,
      state,
      district,
      town,
      area: area || town, // Fallback to town if area is missing
      size: Number(size),
      sizeUnit: sizeUnit || 'sq ft',
      sizeInSqft: getSqftValue(size, sizeUnit || 'sq ft'),
      landType: landType || null,
      listingType: listingType || 'sale',
      propertyCategory: propertyCategory || 'land',
      location: locationObject,
      latitude: lat && lat !== 'null' ? parseFloat(lat) : undefined,
      longitude: lng && lng !== 'null' ? parseFloat(lng) : undefined,
      images: imageUrls,
      owner: req.user._id,
      ownerPhone: ownerPhone || "9876543210",
      type: type || (propertyCategory === 'house' ? 'House' : 'Land'), // Smarter default
      status: status || 'Available'
    });

    console.log("LAND_CREATED_SUCCESSFULLY:", land._id);
    
    // Create SYSTEM notification for the creator
    try {
      if (req.user && req.user._id) {
        await Notification.create({
          user: req.user._id,
          message: `Success! Your property "${title}" is now live in the marketplace.`,
          type: 'system',
          link: `/property/${land._id}`
        });
      }
    } catch (err) {
      console.error("NOTIFICATION_ERROR:", err.message);
    }

    res.status(201).json(land);
  } catch (error) {
    console.error("ADD_LAND_ERROR:", error);
    
    // Provide specific validation error details if available
    let errorDetail = error.message;
    if (error.errors) {
      errorDetail = Object.values(error.errors).map(err => err.message).join(', ');
    }

    res.status(500).json({ 
      success: false,
      message: 'Server Error: Failed to add land listing', 
      error: errorDetail
    });
  }
};

// @desc    Update land
// @route   PUT /api/land/:id
// @access  Private
const updateLand = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (!land) return res.status(404).json({ message: 'Land not found' });
    if (land.owner.toString() !== req.user.id) return res.status(401).json({ message: 'User not authorized' });

    // Handle images: keep existing + add new uploads
    let imageUrls = [];
    
    // Parse existing images from the form (images the user chose to keep)
    if (req.body.existingImages) {
      try {
        const parsed = JSON.parse(req.body.existingImages);
        if (Array.isArray(parsed)) {
          imageUrls = parsed;
        }
      } catch (e) {
        // If it's not JSON, fall back to current images
        imageUrls = land.images;
      }
    } else {
      imageUrls = land.images;
    }

    // Add newly uploaded images
    if (req.files && req.files.length > 0) {
       const newImages = req.files.filter(file => file.path).map(file => file.path);
       imageUrls = [...imageUrls, ...newImages];
    }

    const updatedData = {
      title: req.body.title || land.title,
      price: req.body.price ? Number(req.body.price) : land.price,
      rentPerMonth: req.body.rentPerMonth ? Number(req.body.rentPerMonth) : land.rentPerMonth,
      advance: req.body.advance ? Number(req.body.advance) : land.advance,
      description: req.body.description || land.description,
      state: req.body.state || land.state,
      district: req.body.district || land.district,
      town: req.body.town || land.town,
      area: req.body.area || req.body.town || land.area,
      size: req.body.size ? Number(req.body.size) : land.size,
      sizeUnit: req.body.sizeUnit || land.sizeUnit,
      sizeInSqft: getSqftValue(req.body.size || land.size, req.body.sizeUnit || land.sizeUnit),
      landType: req.body.landType !== undefined ? req.body.landType : land.landType,
      listingType: req.body.listingType || land.listingType,
      propertyCategory: req.body.propertyCategory || land.propertyCategory,
      ownerPhone: req.body.ownerPhone || land.ownerPhone,
      type: req.body.type || land.type,
      status: req.body.status || land.status,
      latitude: req.body.lat ? parseFloat(req.body.lat) : land.latitude,
      longitude: req.body.lng ? parseFloat(req.body.lng) : land.longitude,
      images: imageUrls,
    };

    const updatedLand = await Land.findByIdAndUpdate(req.params.id, updatedData, { new: true, runValidators: true });
    console.log("LAND_UPDATED_SUCCESSFULLY:", updatedLand._id);
    res.json(updatedLand);
  } catch (error) {
    console.error("UPDATE_LAND_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Delete land
// @route   DELETE /api/land/:id
// @access  Private
const deleteLand = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (!land) return res.status(404).json({ message: 'Land not found' });
    if (land.owner.toString() !== req.user.id) return res.status(401).json({ message: 'User not authorized' });

    await land.deleteOne();
    res.json({ id: req.params.id, message: 'Land removed' });
  } catch (error) {
    console.error("DELETE_LAND_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get owner lands
// @route   GET /api/land/my-lands
// @access  Private
const getOwnerLands = async (req, res) => {
  try {
    const lands = await Land.find({ owner: req.user.id }).sort({ createdAt: -1 });
    res.json(lands);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Toggle isActive status
// @route   PATCH /api/land/:id/toggle-active
// @access  Private
const toggleActive = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (!land) return res.status(404).json({ message: 'Land not found' });
    if (land.owner.toString() !== req.user.id) return res.status(401).json({ message: 'User not authorized' });

    land.isActive = !land.isActive;
    await land.save();
    res.json(land);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get recommended lands
// @route   GET /api/land/recommended
// @access  Public
const getRecommendedLands = async (req, res) => {
  try {
    const lands = await Land.find({ isActive: true })
      .select('title images town state propertyCategory listingType size sizeUnit landType price rentPerMonth createdAt averageRating reviewCount status owner')
      .sort({ views: -1, createdAt: -1 })
      .limit(10)
      .lean();
    res.json(lands);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Add a review to land
// @route   POST /api/land/:id/reviews
// @access  Private
const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const land = await Land.findById(req.params.id);

    if (!land) return res.status(404).json({ message: 'Land not found' });

    // Check if user already reviewed
    const alreadyReviewed = land.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.status(400).json({ message: 'Product already reviewed' });
    }

    const review = {
      user: req.user._id,
      rating: Number(rating),
      comment,
      createdAt: new Date()
    };

    land.reviews.push(review);
    land.reviewCount = land.reviews.length;
    land.averageRating = 
      land.reviews.reduce((acc, item) => item.rating + acc, 0) / land.reviews.length;

    await land.save();
    res.status(201).json({ message: 'Review added' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get similar properties
// @route   GET /api/land/:id/similar
// @access  Public
const getSimilarProperties = async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (!land) return res.status(404).json({ message: 'Land not found' });

    // Priority 1: same town, Priority 2: same propertyCategory, Priority 3: similar price
    const similar = await Land.find({
      _id: { $ne: land._id },
      isActive: true,
      $or: [
        { town: land.town },
        { propertyCategory: land.propertyCategory }
      ]
    })
    .select('title images town state propertyCategory listingType size sizeUnit landType price rentPerMonth createdAt averageRating reviewCount status owner')
    .sort({ createdAt: -1 })
    .limit(6)
    .lean()
    .populate('owner', 'name profileImage isVerified');
    res.json(similar);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get recently viewed properties
// @route   GET /api/land/recently-viewed
// @access  Private
const getRecentlyViewed = async (req, res) => {
  try {
    const { category } = req.query;
    
    const user = await User.findById(req.user._id).populate({
      path: 'recentlyViewed.propertyId',
      select: 'title images town state propertyCategory listingType size sizeUnit landType price rentPerMonth createdAt averageRating reviewCount status owner',
      populate: { path: 'owner', select: 'name profileImage isVerified' }
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // 1. Filter out nulls and apply 48-hour auto-expiry
    const expiryTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    let history = (user.recentlyViewed || [])
      .filter(item => 
        item && 
        item.propertyId && 
        item.propertyId._id && // Ensure it's populated
        item.viewedAt && 
        new Date(item.viewedAt) > expiryTime
      )
      .map(item => {
        const landData = item.propertyId.toObject ? item.propertyId.toObject() : item.propertyId;
        return {
          ...landData,
          viewedAt: item.viewedAt
        };
      });

    // 2. Smart Prioritization (Context Filter)
    if (category) {
      // Move items with same category to front, maintaining their relative order
      const matching = history.filter(item => item.propertyCategory === category);
      const others = history.filter(item => item.propertyCategory !== category);
      history = [...matching, ...others];
    }

    res.json(history.slice(0, 5));
  } catch (error) {
    console.error("GET_RECENTLY_VIEWED_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const clearRecentlyViewed = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.recentlyViewed = [];
    await user.save();

    res.json({ success: true, message: 'Recently viewed history cleared' });
  } catch (error) {
    console.error("CLEAR_RECENTLY_VIEWED_ERROR:", error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = {
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
};
