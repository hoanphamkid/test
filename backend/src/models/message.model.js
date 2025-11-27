const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: 'Participants phải gồm 2 email',
      },
    },
    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    readBy: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

messageSchema.index({ participants: 1, createdAt: -1 });
messageSchema.index({ participants: 1 });
messageSchema.index({ readBy: 1 });

module.exports = mongoose.model('Message', messageSchema);

