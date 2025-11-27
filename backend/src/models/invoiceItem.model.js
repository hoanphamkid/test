const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    billid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HoaDon',
      required: true,
    },
    productid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SanPham',
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      default: 'Chưa thanh toán',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('HoaDonChiTiet', invoiceItemSchema);


