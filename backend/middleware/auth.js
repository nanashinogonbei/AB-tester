const jwt = require('jsonwebtoken');
const Account = require('../models/Account');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const JWT_EXPIRES_IN = '24h';

// JWTトークン生成
function generateToken(accountId) {
  return jwt.sign(
    { accountId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 認証ミドルウェア
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const account = await Account.findOne({ accountId: decoded.accountId });
    
    if (!account) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.account = account;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// プロジェクト権限チェックミドルウェア
async function checkProjectPermission(req, res, next) {
  try {
    const account = req.account;
    const projectId = req.params.projectId || req.body.projectId;

    // 全プロジェクト権限を持つ場合
    if (account.allProjects) {
      return next();
    }

    // 特定プロジェクトの権限チェック
    const hasPermission = account.permissions.some(
      p => p.toString() === projectId
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  generateToken,
  authenticate,
  checkProjectPermission
};