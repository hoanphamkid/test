const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DanhMuc = require('../src/models/category.model');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/cooking_app';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_URI;

const CATEGORY_NAMES = [
  'Tất cả',
  'Ít calo',
  'Healthy',
  'Nhanh',
  'Truyền thống',
  'Tráng miệng',
  'Đồ uống',
];

const seedCategories = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const operations = CATEGORY_NAMES.map(async (name) => {
      const trimmed = name.trim();
      const existed = await DanhMuc.findOne({ name: trimmed });
      if (existed) {
        console.log(`• Bỏ qua "${trimmed}" (đã tồn tại)`);
        return existed;
      }
      const created = await DanhMuc.create({ name: trimmed });
      console.log(`+ Đã thêm danh mục "${trimmed}"`);
      return created;
    });

    await Promise.all(operations);
    console.log('🎉 Seed danh mục hoàn tất');
  } catch (error) {
    console.error('❌ Lỗi khi seed danh mục:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seedCategories();


