const mongoose = require('mongoose');

const landSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title can not be more than 100 characters']
  },
  price: {
    type: Number,
    required: false
  },
  rentPerMonth: {
    type: Number,
    required: false
  },
  advance: {
    type: Number,
    required: false
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [1000, 'Description can not be more than 1000 characters']
  },
  state: {
    type: String,
    required: [true, 'Please add a state'],
    index: true
  },
  district: {
    type: String,
    required: [true, 'Please add a district'],
    index: true
  },
  town: {
    type: String,
    required: [true, 'Please add a town'],
    index: true
  },
  area: {
    type: String,
    required: [true, 'Please add an area location'],
    index: true
  },
  location: {
    // GeoJSON Point
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: {
      type: [Number],
      required: false,
      index: '2dsphere' // For spatial queries based on lat/lng
    }
  },
  latitude: {
    type: Number,
    required: false
  },
  longitude: {
    type: Number,
    required: false
  },
  images: {
    type: [String],
    default: []
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  ownerPhone: {
    type: String,
    required: [true, 'Please add a contact phone number'],
    default: "9876543210"
  },
  size: {
    type: Number,
    required: [true, 'Please add land size']
  },
  sizeUnit: {
    type: String,
    enum: ['sq ft', 'acres', 'cents', 'sqm'],
    default: 'sq ft'
  },
  sizeInSqft: {
    type: Number,
    index: true
  },
  landType: {
    type: String,
    default: null,
    index: true
  },
  listingType: {
    type: String,
    enum: ['sale', 'rent'],
    required: [true, 'Please specify listingType: sale or rent']
  },
  propertyCategory: {
    type: String,
    enum: ['land', 'house', 'shop'],
    required: [true, 'Please specify propertyCategory: land, house, or shop']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  views: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  wishlistCount: {
    type: Number,
    default: 0
  },
  reviews: [
    {
      user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },
      comment: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  averageRating: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Available', 'Sold'],
    default: 'Available',
    index: true
  },
  type: {
    type: String,
    enum: ['Land', 'House', 'Plot'],
    default: 'Land',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Land', landSchema);
