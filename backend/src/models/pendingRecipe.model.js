const mongoose = require('mongoose');

const pendingRecipeStepSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    description: { type: String, trim: true, required: true },
    imageUrl: { type: String, trim: true },
  },
  { _id: false }
);

const pendingRecipeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    duration: { type: String, trim: true },
    category: {
      type: String,
      enum: ['LOW_CAL', 'HEALTHY', 'QUICK', 'TRADITIONAL', 'DESSERT', 'DRINK', 'ALL'],
      default: 'ALL',
    },
    imageUrl: { type: String, trim: true },
    steps: {
      type: [pendingRecipeStepSchema],
      validate: [
        {
          validator(value) {
            return Array.isArray(value) && value.length > 0;
          },
          message: 'Cần ít nhất một bước hướng dẫn',
        },
      ],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    authorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    authorName: { type: String, trim: true },
    reviewerEmail: { type: String, trim: true, lowercase: true },
    reviewerName: { type: String, trim: true },
    reviewedAt: Date,
    rejectionReason: { type: String, trim: true },
    publishedRecipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
      email: { type: String, trim: true, lowercase: true },
      name: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

const PendingRecipe = mongoose.model('PendingRecipe', pendingRecipeSchema);

module.exports = PendingRecipe;

