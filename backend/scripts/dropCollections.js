const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(
    `⚠️  Không tìm thấy file .env tại ${envPath}. Sẽ dùng biến môi trường hiện có hoặc giá trị mặc định.`
  );
}

const cliArgs = process.argv.slice(2);
const uriArg = cliArgs.find((arg) => arg.startsWith('--uri='));

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/cooking_app';

const TARGET_COLLECTIONS = [
  'danhmucs',
  'hoadonchitiets',
  'hoadons',
  'sanphams',
  'users',
];

const maskUri = (uri) => {
  if (!uri) return '';
  return uri.replace(/\/\/([^@]+)@/, '//***:***@');
};

const run = async () => {
  const uri = (uriArg && uriArg.split('=')[1]) || process.env.MONGODB_URI || DEFAULT_URI;

  if (!uri) {
    console.error('❌ Thiếu biến môi trường MONGODB_URI');
    process.exit(1);
  }

  try {
    console.log(`🔗 Đang kết nối đến: ${maskUri(uri)}`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Đã kết nối MongoDB');

    const existing = await mongoose.connection.db.listCollections().toArray();
    const existingNames = new Set(existing.map((col) => col.name));

    for (const name of TARGET_COLLECTIONS) {
      if (!existingNames.has(name)) {
        console.log(`⚠️ Collection "${name}" không tồn tại, bỏ qua`);
        continue;
      }

      try {
        await mongoose.connection.db.dropCollection(name);
        console.log(`🗑️  Đã xóa collection "${name}"`);
      } catch (err) {
        console.error(`❌ Lỗi khi xóa "${name}":`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Không kết nối được MongoDB:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Đã đóng kết nối');
  }
};

run();

