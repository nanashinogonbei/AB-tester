const express = require('express');
const rateLimit = require('express-rate-limit');
const Account = require('../models/Account');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// ログイン試行回数制限（15分間に5回まで）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'ログイン試行回数が多すぎます。しばらく待ってから再試行してください。',
  standardHeaders: true,
  legacyHeaders: false,
});

// ログインエンドポイント
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { accountId, password } = req.body;
    
    if (!accountId || !password) {
      return res.status(400).json({ 
        error: 'アカウントIDとパスワードを入力してください' 
      });
    }

    // アカウント検索
    const account = await Account.findOne({ accountId })
      .populate('permissions', 'name');
    
    if (!account) {
      return res.status(401).json({ 
        error: 'アカウントIDまたはパスワードが正しくありません' 
      });
    }

    // アカウントロックチェック
    if (account.isLocked()) {
      return res.status(423).json({ 
        error: 'アカウントがロックされています。しばらく待ってから再試行してください。' 
      });
    }

    // パスワード検証
    const isMatch = await account.comparePassword(password);
    
    if (!isMatch) {
      await account.incLoginAttempts();
      return res.status(401).json({ 
        error: 'アカウントIDまたはパスワードが正しくありません' 
      });
    }

    // ログイン成功
    await account.resetLoginAttempts();

    // JWTトークン生成
    const token = generateToken(account.accountId);

    res.json({
      token,
      account: {
        accountId: account.accountId,
        allProjects: account.allProjects,
        permissionIds: account.permissions.map(p => p._id.toString())
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'ログイン処理中にエラーが発生しました' });
  }
});

// トークン検証エンドポイント
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const account = await Account.findOne({ accountId: decoded.accountId })
      .populate('permissions', 'name');
    
    if (!account) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      valid: true,
      account: {
        accountId: account.accountId,
        allProjects: account.allProjects,
        permissionIds: account.permissions.map(p => p._id.toString())
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;