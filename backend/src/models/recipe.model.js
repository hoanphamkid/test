const mongoose = require('mongoose');

const recipeStepSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, required: true },
    imageUrl: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const recipeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    categoryid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DanhMuc',
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    productid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SanPham',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    authorName: {
      type: String,
      trim: true,
      default: '',
    },
    authorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    steps: {
      type: [recipeStepSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Recipe', recipeSchema);

