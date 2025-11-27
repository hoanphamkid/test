const Account = require('./account.model');
const DanhMuc = require('./category.model');
const SanPham = require('./product.model');
const HoaDon = require('./invoice.model');
const HoaDonChiTiet = require('./invoiceItem.model');
const Recipe = require('./recipe.model');
const Message = require('./message.model');
const PendingRecipe = require('./pendingRecipe.model');

module.exports = {
  Account,
  DanhMuc,
  SanPham,
  HoaDon,
  HoaDonChiTiet,
  Recipe,
  Message,
  PendingRecipe,
};

