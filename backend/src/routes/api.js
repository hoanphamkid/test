const express = require('express');
const mongoose = require('mongoose');
const JWT_ASM = require('jsonwebtoken');
const upload = require('../config/upload');
const { getTransporter } = require('../config/mailer');
const {
  Account,
  DanhMuc,
  SanPham,
  Recipe,
  Message,
  PendingRecipe,
} = require('../models/asm');
const User = require('../models/user.model');
const { comparePassword } = require('../utils/password');

const router = express.Router();
const SECRETKEY_ASM = 'PHAMTHANHHOAN';

const sanitizeAccount = (account) => {
  if (!account) return null;
  const obj = account.toObject ? account.toObject() : account;
  const { password, ...rest } = obj;
  const _id = obj._id || obj.id;
  const normalizedId =
    typeof _id === 'object' && _id !== null && _id.toString ? _id.toString() : _id;
  return {
    ...rest,
    _id,
    id: normalizedId,
  };
};

const buildLegacySafeUser = (user) => ({
  _id: user._id,
  id: user._id?.toString?.() || user._id,
  name: user.name,
  email: user.email,
  role: user.role || 'user',
  avatar: user.avatar || '',
  available: true,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const ensureObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error('ID không hợp lệ');
    error.status = 400;
    throw error;
  }
  return value;
};

const sendRegistrationEmail = async () => true;

const dropInvalidMessageIndexes = async () => {
  if (!Message?.collection) return;
  const invalidNames = ['readBy_1_participants_1', 'participants_1_readBy_1'];
  for (const name of invalidNames) {
    try {
      await Message.collection.dropIndex(name);
      console.warn(`Đã xóa index không hợp lệ: ${name}`);
    } catch (err) {
      if (err?.codeName !== 'IndexNotFound') {
        console.warn(`Không thể xóa index ${name}:`, err.message);
      }
    }
  }
};

const createMessageDocument = async (payload) => {
  try {
    return await Message.create(payload);
  } catch (error) {
    if (error?.message?.includes('parallel arrays')) {
      await dropInvalidMessageIndexes();
      return Message.create(payload);
    }
    throw error;
  }
};

const normalizeEmail = (email) => (email ? email.trim().toLowerCase() : '');

const sanitizeRecipeSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps
    .map((step) => ({
      title: step?.title ? step.title.trim() : '',
      description: step?.description ? step.description.trim() : '',
      imageUrl: step?.imageUrl ? step.imageUrl.trim() : '',
    }))
    .filter((step) => step.title && step.description);
};

const PENDING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const PENDING_CATEGORIES = [
  'LOW_CAL',
  'HEALTHY',
  'QUICK',
  'TRADITIONAL',
  'DESSERT',
  'DRINK',
  'ALL',
];

const normalizePendingCategory = (value) => {
  if (!value || typeof value !== 'string') {
    return 'ALL';
  }
  const normalized = value.trim().toUpperCase();
  return PENDING_CATEGORIES.includes(normalized) ? normalized : 'ALL';
};

const isAdminAccount = (account) => (account?.role || '').toLowerCase() === 'admin';

const extractBearerToken = (headerValue) => {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const authenticateRequest = async (req, { requireAdmin = false } = {}) => {
  const token = extractBearerToken(req.headers?.authorization || req.headers?.Authorization);
  if (!token) {
    const error = new Error('Thiếu token xác thực');
    error.status = 401;
    throw error;
  }
  try {
    const payload = JWT_ASM.verify(token, SECRETKEY_ASM);
    const account = await Account.findById(payload.id);
    if (!account) {
      const error = new Error('Token không hợp lệ');
      error.status = 401;
      throw error;
    }
    if (!account.available) {
      const error = new Error('Tài khoản đã bị vô hiệu hóa');
      error.status = 403;
      throw error;
    }
    if (requireAdmin && !isAdminAccount(account)) {
      const error = new Error('Bạn không có quyền thực hiện thao tác này');
      error.status = 403;
      throw error;
    }
    return account;
  } catch (error) {
    if (!error.status) {
      error.status = 401;
      error.message =
        error.name === 'TokenExpiredError' ? 'Token đã hết hạn' : 'Token không hợp lệ';
    }
    throw error;
  }
};

const sanitizePendingSteps = (steps) => {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps
    .map((step, index) => {
      const description = step?.description ? step.description.trim() : '';
      if (!description) {
        return null;
      }
      return {
        title: step?.title?.trim() || `Bước ${index + 1}`,
        description,
        imageUrl: step?.imageUrl?.trim() || '',
      };
    })
    .filter(Boolean);
};

const mapPendingRecipe = (doc) => {
  if (!doc) {
    return null;
  }
  const obj = doc.toObject ? doc.toObject() : doc;
  const steps = Array.isArray(obj.steps)
    ? obj.steps.map((step, index) => ({
        title: step?.title || `Bước ${index + 1}`,
        description: step?.description || '',
        imageUrl: step?.imageUrl || '',
      }))
    : [];
  return {
    id: obj._id?.toString?.() || obj._id,
    name: obj.name || '',
    description: obj.description || '',
    duration: obj.duration || '',
    category: obj.category || 'ALL',
    imageUrl: obj.imageUrl || '',
    steps,
    status: obj.status || 'PENDING',
    authorEmail: obj.authorEmail || '',
    authorName: obj.authorName || '',
    reviewerEmail: obj.reviewerEmail || '',
    reviewerName: obj.reviewerName || '',
    rejectionReason: obj.rejectionReason || '',
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    publishedRecipeId: obj.publishedRecipeId || null,
  };
};

const publishRecipeFromPending = async (pendingDoc) => {
  if (!pendingDoc) {
    return null;
  }
  const payload = {
    name: pendingDoc.name,
    description: pendingDoc.description,
    duration: pendingDoc.duration,
    category: pendingDoc.category,
    imageUrl: pendingDoc.imageUrl,
    authorName: pendingDoc.authorName,
    authorEmail: pendingDoc.authorEmail,
    steps: sanitizePendingSteps(pendingDoc.steps),
  };

  if (pendingDoc.publishedRecipeId) {
    await Recipe.findByIdAndUpdate(pendingDoc.publishedRecipeId, payload, { new: true });
    return pendingDoc.publishedRecipeId;
  }
  const created = await Recipe.create(payload);
  pendingDoc.publishedRecipeId = created._id;
  return created._id;
};

const buildClientUser = (account) => ({
  id: account._id,
  name: account.name,
  email: account.email,
  role: account.role || 'user',
  avatar: account.avatar || '',
});

const issueTokens = (accountId) => ({
  token: JWT_ASM.sign({ id: accountId }, SECRETKEY_ASM, { expiresIn: '1h' }),
  refreshToken: JWT_ASM.sign({ id: accountId }, SECRETKEY_ASM, { expiresIn: '1d' }),
});

const handleRegister = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({
        status: 400,
        messenger: 'Email, mật khẩu và tên là bắt buộc',
        data: [],
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const existedEmail = await Account.findOne({ email: normalizedEmail });
    if (existedEmail) {
      return res.status(400).json({
        status: 400,
        messenger: 'Email đã tồn tại',
        data: [],
      });
    }

    const newUser = new Account({
      email: normalizedEmail,
      password: password.trim(),
      name: name.trim(),
      avatar: req.file ? `/uploads/${req.file.filename}` : '',
      available: true,
    });

    const result = await newUser.save();
    await sendRegistrationEmail(result);
    const { token, refreshToken } = issueTokens(result._id);

    return res.json({
      status: 200,
      messenger: 'Đăng ký thành công',
      user: buildClientUser(result),
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Lỗi khi đăng ký:', error);
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
};

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        status: 400,
        messenger: 'Email và mật khẩu là bắt buộc',
        data: [],
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = await Account.findOne({ email: normalizedEmail, password: password.trim() });
    if (user && user.available) {
      const { token, refreshToken } = issueTokens(user._id);
      return res.json({
        status: 200,
        messenger: 'Đăng nhập thành công',
        user: buildClientUser(user),
        token,
        refreshToken,
      });
    }

    const legacyUser = await User.findOne({ email: normalizedEmail });
    if (legacyUser) {
      const valid = await comparePassword(password, legacyUser.passwordHash);
      if (valid) {
        const migratedAccount = await Account.findOneAndUpdate(
          { email: normalizedEmail },
          {
            email: normalizedEmail,
            password: password.trim(),
            name: legacyUser.name || legacyUser.email,
            available: true,
            role: legacyUser.role || 'user',
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        const { token, refreshToken } = issueTokens(migratedAccount._id);
    return res.json({
          status: 200,
          messenger: 'Đăng nhập thành công',
          user: buildClientUser(migratedAccount),
          token,
          refreshToken,
          legacy: true,
        });
      }
    }
    return res.status(400).json({
      status: 400,
      messenger: 'Lỗi, đăng nhập không thành công',
      data: [],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
};

const fetchMergedUsers = async () => {
  const [accounts, legacyUsers] = await Promise.all([
    Account.find().sort({ createdAt: -1 }),
    User.find().sort({ createdAt: -1 }),
  ]);

  const merged = new Map();
  accounts.forEach((acc) => {
    merged.set(acc.email, sanitizeAccount(acc));
  });
  legacyUsers.forEach((legacy) => {
    if (!merged.has(legacy.email)) {
      merged.set(legacy.email, buildLegacySafeUser(legacy));
    }
  });
  return Array.from(merged.values());
};

const handleGetUsers = async (_req, res) => {
  try {
    const data = await fetchMergedUsers();
    return res.json({
      status: 200,
      messenger: 'Danh sách users',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: err.message,
    });
  }
};

const handleGetUsersLegacy = async (_req, res) => {
  try {
    const data = await fetchMergedUsers();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: err.message,
    });
  }
};

const handleDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const deleted = await Account.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy user',
      });
    }
    return res.json({
      status: 200,
      messenger: 'Đã xóa user thành công',
      data: sanitizeAccount(deleted),
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
};

const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'Email là bắt buộc',
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const account = await Account.findOne({ email: normalizedEmail });
    if (!account) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy tài khoản',
      });
    }

    const temporaryPassword = process.env.DEFAULT_RESET_PASSWORD?.trim() || '123456';
    account.password = temporaryPassword;
    await account.save();

    return res.json({
      status: 200,
      messenger: 'Đã đặt lại mật khẩu về mặc định',
      temporaryPassword,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
};

router.post('/asm/reg-mail', upload.single('avatar'), handleRegister);
router.post('/auth/register', handleRegister);

router.post('/asm/login', handleLogin);
router.post('/auth/login', handleLogin);

router.post('/auth/forgot-password', handleForgotPassword);

router.get('/asm/get-all-user', handleGetUsers);
router.get('/auth/users', handleGetUsersLegacy);

router.delete('/auth/users/:id', handleDeleteUser);

router.put('/asm/update-password/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const { password } = req.body;
    if (!password || !password.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'Mật khẩu mới không được để trống',
        data: [],
      });
    }
    const result = await Account.findByIdAndUpdate(
      id,
      { password: password.trim() },
      { new: true }
    );
    if (!result) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy user',
        data: [],
      });
    }
    return res.status(200).json({
      status: 200,
      messenger: 'Cập nhật mật khẩu thành công',
      data: sanitizeAccount(result),
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
});

router.post('/recipes/pending', async (req, res) => {
  try {
    const account = await authenticateRequest(req);
    const { name, description, duration, category, imageUrl, steps } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên món ăn là bắt buộc' });
    }
    if (!duration || !duration.trim()) {
      return res.status(400).json({ message: 'Thời gian nấu là bắt buộc' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Mô tả món ăn là bắt buộc' });
    }
    if (!imageUrl || !imageUrl.trim()) {
      return res.status(400).json({ message: 'Ảnh món ăn là bắt buộc' });
    }
    const sanitizedSteps = sanitizePendingSteps(steps);
    if (!sanitizedSteps.length) {
      return res.status(400).json({ message: 'Cần ít nhất một bước hướng dẫn' });
    }
    const pending = await PendingRecipe.create({
      name: name.trim(),
      description: description.trim(),
      duration: duration.trim(),
      category: normalizePendingCategory(category),
      imageUrl: imageUrl.trim(),
      steps: sanitizedSteps,
      authorEmail: normalizeEmail(account.email),
      authorName: account.name || account.email,
      createdBy: {
        userId: account._id,
        email: normalizeEmail(account.email),
        name: account.name || '',
      },
    });
    return res.status(201).json(mapPendingRecipe(pending));
  } catch (error) {
    console.error('POST /recipes/pending error:', error);
    return res.status(error.status || 500).json({
      message: error.message || 'Lỗi server',
    });
  }
});

router.get('/recipes/pending', async (req, res) => {
  try {
    const account = await authenticateRequest(req);
    const { status, authorEmail } = req.query || {};
    const filter = {};
    if (status && status.trim()) {
      const normalizedStatus = status.trim().toUpperCase();
      if (normalizedStatus !== 'ALL') {
        if (!PENDING_STATUSES.includes(normalizedStatus)) {
          return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
        }
        filter.status = normalizedStatus;
      }
    }
    const normalizedAuthorEmail = normalizeEmail(authorEmail);
    if (normalizedAuthorEmail) {
      if (!isAdminAccount(account) && normalizedAuthorEmail !== normalizeEmail(account.email)) {
        return res.status(403).json({ message: 'Bạn không thể xem bài của người khác' });
      }
      filter.authorEmail = normalizedAuthorEmail;
    } else if (!isAdminAccount(account)) {
      filter.authorEmail = normalizeEmail(account.email);
    }

    const results = await PendingRecipe.find(filter).sort({ createdAt: -1 });
    return res.json(results.map(mapPendingRecipe));
  } catch (error) {
    console.error('GET /recipes/pending error:', error);
    return res.status(error.status || 500).json({
      message: error.message || 'Lỗi server',
    });
  }
});

router.post('/recipes/pending/:id/decision', async (req, res) => {
  try {
    const admin = await authenticateRequest(req, { requireAdmin: true });
    const { id } = req.params;
    ensureObjectId(id);
    const action = req.body?.action ? req.body.action.trim().toUpperCase() : '';
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ message: 'Hành động không hợp lệ' });
    }

    const pending = await PendingRecipe.findById(id);
    if (!pending) {
      return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
    }
    if (pending.status !== 'PENDING') {
      return res.status(400).json({ message: 'Bài đăng đã được xử lý' });
    }

    pending.reviewerEmail = normalizeEmail(admin.email);
    pending.reviewerName = admin.name || admin.email;
    pending.reviewedAt = new Date();

    if (action === 'APPROVE') {
      pending.status = 'APPROVED';
      pending.rejectionReason = '';
      await publishRecipeFromPending(pending);
    } else {
      pending.status = 'REJECTED';
      const rejectionReason = req.body?.rejectionReason?.trim();
      pending.rejectionReason = rejectionReason || 'Bài đăng đã bị từ chối';
    }

    await pending.save();
    return res.json(mapPendingRecipe(pending));
  } catch (error) {
    console.error('POST /recipes/pending/:id/decision error:', error);
    return res.status(error.status || 500).json({
      message: error.message || 'Lỗi server',
    });
  }
});

router.delete('/recipes/pending/:id', async (req, res) => {
  try {
    const requester = await authenticateRequest(req);
    const { id } = req.params;
    ensureObjectId(id);
    const pending = await PendingRecipe.findById(id);
    if (!pending) {
      return res.status(404).json({ message: 'Không tìm thấy bài đăng' });
    }
    const requesterEmail = normalizeEmail(requester.email);
    if (!isAdminAccount(requester) && pending.authorEmail !== requesterEmail) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa bài đăng này' });
    }
    await pending.deleteOne();
    return res.status(204).send();
  } catch (error) {
    console.error('DELETE /recipes/pending/:id error:', error);
    return res.status(error.status || 500).json({
      message: error.message || 'Lỗi server',
    });
  }
});

router.get('/asm/user-recipes', async (req, res) => {
  try {
    const { status = 'ALL', authorEmail, page = 1, limit = 10 } = req.query || {};
    const normalizedStatus = status.trim().toUpperCase();
    const normalizedAuthorEmail = normalizeEmail(authorEmail);
    const pagination = {
      page: Math.max(parseInt(page, 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50),
    };
    const filter = {};
    if (normalizedStatus !== 'ALL') {
      if (!PENDING_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({
          status: 400,
          messenger: 'Trạng thái không hợp lệ',
          data: [],
        });
      }
      filter.status = normalizedStatus;
    }
    if (normalizedAuthorEmail) {
      filter.authorEmail = normalizedAuthorEmail;
    }

    const [items, total] = await Promise.all([
      PendingRecipe.find(filter)
        .sort({ createdAt: -1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit),
      PendingRecipe.countDocuments(filter),
    ]);

    return res.json({
      status: 200,
      messenger: 'Danh sách công thức người dùng gửi',
      pagination: {
        ...pagination,
        total,
        totalPages: Math.max(Math.ceil(total / pagination.limit), 1),
      },
      data: items.map(mapPendingRecipe),
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy danh sách công thức người dùng gửi',
      error: error.message,
    });
  }
});

router.get('/asm/user-recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const recipe = await PendingRecipe.findById(id);
    if (!recipe) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy công thức',
      });
    }
    return res.json({
      status: 200,
      messenger: 'Chi tiết công thức người dùng gửi',
      data: mapPendingRecipe(recipe),
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy chi tiết công thức người dùng gửi',
      error: error.message,
    });
  }
});

router.post('/asm/add-danhmuc', async (req, res) => {
  try {
    const { name } = req.body;
  if (!name || !name.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'Tên danh mục không được để trống',
        data: [],
      });
    }
    const existed = await DanhMuc.findOne({ name: name.trim() });
    if (existed) {
      return res.status(400).json({
        status: 400,
        messenger: 'Danh mục đã tồn tại',
        data: existed,
      });
    }
    const result = await DanhMuc.create({ name: name.trim() });
    return res.status(200).json({
      status: 200,
      messenger: 'Thêm danh mục thành công',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server, thêm danh mục thất bại',
      error: error.message,
    });
  }
});

router.get('/asm/get-all-danhmuc', async (_req, res) => {
  try {
    const categories = await DanhMuc.find().sort({ createdAt: -1 });
    return res.json({
      status: 200,
      messenger: 'Danh sách danh mục',
      data: categories,
    });
  } catch (err) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: err.message,
    });
  }
});

router.delete('/asm/delete-danhmuc/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const category = await DanhMuc.findById(id);
    if (!category) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy danh mục',
        data: null,
      });
    }
    const productsUsingCategory = await SanPham.find({ categoryid: id });
    if (productsUsingCategory.length > 0) {
      return res.status(400).json({
        status: 400,
        messenger: `Không thể xóa danh mục này vì có ${productsUsingCategory.length} sản phẩm đang sử dụng`,
        data: {
          categoryName: category.name,
          productsCount: productsUsingCategory.length,
          products: productsUsingCategory.map((p) => ({ _id: p._id, name: p.name })),
        },
      });
    }
    await DanhMuc.findByIdAndDelete(id);
    return res.status(200).json({
      status: 200,
      messenger: 'Xóa danh mục thành công',
      data: category,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi xóa danh mục',
      error: error.message,
    });
  }
});

router.post('/asm/add-sanpham', async (req, res) => {
  try {
    const { name, description, price, image, categoryid } = req.body;
    if (!name || !price || !image || !categoryid) {
      return res.status(400).json({
        status: 400,
        messenger: 'Thiếu dữ liệu (name, price, image, categoryid là bắt buộc)',
      });
    }
    ensureObjectId(categoryid);
    const category = await DanhMuc.findById(categoryid);
    if (!category) {
      return res.status(404).json({
        status: 404,
        messenger: 'ID danh mục không tồn tại',
      });
    }
    const result = await SanPham.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      price: Number(price),
      image: image.trim(),
      categoryid,
    });
    const productWithCategory = await SanPham.findById(result._id).populate('categoryid');
    return res.status(200).json({
      status: 200,
      messenger: 'Thêm sản phẩm thành công',
      data: productWithCategory,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
});

router.get('/asm/get-sanpham-danhmuc/:categoryid', async (req, res) => {
  try {
    const { categoryid } = req.params;
    ensureObjectId(categoryid);
    const category = await DanhMuc.findById(categoryid);
    if (!category) {
      return res.status(404).json({
        status: 404,
        messenger: 'Danh mục không tồn tại',
      });
    }
    const products = await SanPham.find({ categoryid }).populate('categoryid');
    return res.status(200).json({
      status: 200,
      messenger: 'Lấy danh sách sản phẩm theo danh mục thành công',
      data: products,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
});

router.get('/asm/sanpham/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'Vui lòng nhập từ khóa tìm kiếm',
      });
    }
    const products = await SanPham.find({
      name: { $regex: keyword.trim(), $options: 'i' },
    }).populate('categoryid');
    if (!products.length) {
      return res.status(404).json({
        status: 404,
        messenger: 'Không tìm thấy sản phẩm nào',
        data: [],
      });
    }
    return res.status(200).json({
      status: 200,
      messenger: 'Tìm kiếm sản phẩm thành công',
      data: products,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
});

router.get('/asm/sanpham/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const product = await SanPham.findById(id).populate('categoryid');
    if (!product) {
      return res.status(404).json({
        status: 404,
        messenger: 'Sản phẩm không tồn tại',
      });
    }
    return res.status(200).json({
      status: 200,
      messenger: 'Lấy chi tiết sản phẩm thành công',
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server',
      error: error.message,
    });
  }
});

router.put('/asm/update-sanpham/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const { name, description, price, image, categoryid } = req.body;
    const existingProduct = await SanPham.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        status: 404,
        messenger: 'Sản phẩm không tồn tại',
      });
    }
    if (categoryid && categoryid !== existingProduct.categoryid.toString()) {
      ensureObjectId(categoryid);
      const category = await DanhMuc.findById(categoryid);
      if (!category) {
        return res.status(404).json({
          status: 404,
          messenger: 'ID danh mục không tồn tại',
        });
      }
    }
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (price !== undefined) updateData.price = Number(price);
    if (image !== undefined) updateData.image = image.trim();
    if (categoryid !== undefined) updateData.categoryid = categoryid;

    const updatedProduct = await SanPham.findByIdAndUpdate(id, updateData, { new: true }).populate('categoryid');
    return res.status(200).json({
      status: 200,
      messenger: 'Cập nhật sản phẩm thành công',
      data: updatedProduct,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi cập nhật sản phẩm',
      error: error.message,
    });
  }
});

router.put('/asm/update-sanpham-image/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const { image } = req.body;
    if (!image || !image.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'URL hình ảnh không được để trống',
      });
    }
    const existingProduct = await SanPham.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        status: 404,
        messenger: 'Sản phẩm không tồn tại',
      });
    }
    const updatedProduct = await SanPham.findByIdAndUpdate(
      id,
      { image: image.trim() },
      { new: true }
    ).populate('categoryid');
    return res.status(200).json({
      status: 200,
      messenger: 'Cập nhật hình ảnh sản phẩm thành công',
      data: updatedProduct,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi cập nhật hình ảnh',
      error: error.message,
    });
  }
});

router.post('/asm/recipes', async (req, res) => {
  try {
    const {
      name,
      description,
      duration,
      categoryid,
      imageUrl,
      authorName,
      authorEmail,
      steps,
      productid,
    } = req.body;

    if (!name || !categoryid || !steps) {
      return res.status(400).json({
        status: 400,
        messenger: 'name, categoryid và steps là bắt buộc',
      });
    }

    ensureObjectId(categoryid);
    const category = await DanhMuc.findById(categoryid);
    if (!category) {
      return res.status(404).json({
        status: 404,
        messenger: 'Danh mục không tồn tại',
      });
    }

    let product = null;
    if (productid) {
      ensureObjectId(productid);
      product = await SanPham.findById(productid);
      if (!product) {
        return res.status(404).json({
          status: 404,
          messenger: 'Sản phẩm không tồn tại',
        });
      }
    }

    const normalizedSteps = sanitizeRecipeSteps(steps);
    if (!normalizedSteps.length) {
      return res.status(400).json({
        status: 400,
        messenger: 'Cần ít nhất một bước hướng dẫn hợp lệ',
      });
    }

    const recipe = await Recipe.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      duration: duration ? duration.trim() : '',
      categoryid,
      category: category.name,
      imageUrl: imageUrl ? imageUrl.trim() : '',
      authorName: authorName ? authorName.trim() : '',
      authorEmail: normalizeEmail(authorEmail),
      productid: product ? product._id : undefined,
      steps: normalizedSteps,
    });

    const populated = await Recipe.findById(recipe._id).populate('categoryid').populate('productid');
    return res.status(201).json({
      status: 201,
      messenger: 'Thêm công thức thành công',
      data: populated,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi thêm công thức',
      error: error.message,
    });
  }
});

router.get('/asm/recipes', async (_req, res) => {
  try {
    const recipes = await Recipe.find().sort({ createdAt: -1 }).populate('categoryid').populate('productid');
    return res.status(200).json({
      status: 200,
      messenger: 'Danh sách công thức',
      data: recipes,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy danh sách công thức',
      error: error.message,
    });
  }
});

router.get('/asm/recipes/category/:categoryid', async (req, res) => {
  try {
    const { categoryid } = req.params;
    ensureObjectId(categoryid);
    const category = await DanhMuc.findById(categoryid);
    if (!category) {
      return res.status(404).json({
        status: 404,
        messenger: 'Danh mục không tồn tại',
      });
    }
    const recipes = await Recipe.find({ categoryid }).sort({ createdAt: -1 }).populate('categoryid').populate('productid');
    return res.status(200).json({
      status: 200,
      messenger: 'Danh sách công thức theo danh mục',
      data: recipes,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy công thức theo danh mục',
      error: error.message,
    });
  }
});

router.get('/asm/recipes/product/:productid', async (req, res) => {
  try {
    const { productid } = req.params;
    ensureObjectId(productid);
    const product = await SanPham.findById(productid);
    if (!product) {
      return res.status(404).json({
        status: 404,
        messenger: 'Sản phẩm không tồn tại',
      });
    }
    const recipes = await Recipe.find({ productid }).sort({ createdAt: -1 }).populate('categoryid').populate('productid');
    return res.status(200).json({
      status: 200,
      messenger: 'Công thức theo sản phẩm',
      data: recipes,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy công thức theo sản phẩm',
      error: error.message,
    });
  }
});

router.get('/asm/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const recipe = await Recipe.findById(id).populate('categoryid').populate('productid');
    if (!recipe) {
      return res.status(404).json({
        status: 404,
        messenger: 'Công thức không tồn tại',
      });
    }
    return res.status(200).json({
      status: 200,
      messenger: 'Chi tiết công thức',
      data: recipe,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy chi tiết công thức',
      error: error.message,
    });
  }
});

router.delete('/asm/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    ensureObjectId(id);
    const deleted = await Recipe.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        status: 404,
        messenger: 'Công thức không tồn tại',
      });
    }
    return res.status(200).json({
      status: 200,
      messenger: 'Xóa công thức thành công',
      data: deleted,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi xóa công thức',
      error: error.message,
    });
  }
});

router.post('/asm/messages', async (req, res) => {
  try {
    const { senderEmail, receiverEmail, content } = req.body;
    const sender = normalizeEmail(senderEmail);
    const receiver = normalizeEmail(receiverEmail);
    if (!sender || !receiver || sender === receiver) {
      return res.status(400).json({
        status: 400,
        messenger: 'senderEmail và receiverEmail hợp lệ là bắt buộc',
      });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({
        status: 400,
        messenger: 'Nội dung tin nhắn không được để trống',
      });
    }
    const participants = [sender, receiver].sort();
    const messagePayload = {
      participants,
      senderEmail: sender,
      content: content.trim(),
      readBy: [sender],
    };
    const message = await createMessageDocument(messagePayload);
    return res.status(200).json({
      status: 200,
      messenger: 'Gửi tin nhắn thành công',
      data: message,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi gửi tin nhắn',
      error: error.message,
    });
  }
});

router.get('/asm/messages/thread', async (req, res) => {
  try {
    const userA = normalizeEmail(req.query.userA);
    const userB = normalizeEmail(req.query.userB);
    if (!userA || !userB || userA === userB) {
      return res.status(400).json({
        status: 400,
        messenger: 'userA và userB hợp lệ là bắt buộc',
      });
    }
    const participants = [userA, userB].sort();
    const messages = await Message.find({
      participants: { $all: participants },
    }).sort({ createdAt: 1 });
    await Message.updateMany(
      { participants: { $all: participants }, readBy: { $ne: userA } },
      { $addToSet: { readBy: userA } }
    );
    return res.status(200).json({
      status: 200,
      messenger: 'Danh sách tin nhắn',
      data: messages,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy tin nhắn',
      error: error.message,
    });
  }
});

router.get('/asm/messages/inbox/:email', async (req, res) => {
  try {
    const email = normalizeEmail(req.params.email);
    if (!email) {
      return res.status(400).json({
        status: 400,
        messenger: 'Email không hợp lệ',
      });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const messages = await Message.find({ participants: email })
      .sort({ createdAt: -1 })
      .limit(limit);
    return res.status(200).json({
      status: 200,
      messenger: 'Danh sách hội thoại gần đây',
      data: messages,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      messenger: 'Lỗi server khi lấy danh sách hội thoại',
      error: error.message,
    });
  }
});

module.exports = router;

