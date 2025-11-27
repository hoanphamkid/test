const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    accountid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('HoaDon', invoiceSchema);


