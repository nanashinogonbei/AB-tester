const express = require('express');
const Account = require('../models/Account');
const Project = require('../models/Project');
const { isValidAccountId, containsScript } = require('../utils/sanitize');

const router = express.Router();

// アカウント一覧取得
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find()
      .populate('permissions', 'name')
      .sort({ createdAt: -1 });
    
    const accountsWithPermissions = accounts.map(acc => ({
      _id: acc._id,
      accountId: acc.accountId,
      password: acc.password,
      allProjects: acc.allProjects,
      permissions: acc.allProjects ? '全て' : acc.permissions.map(p => p.name).join('、') || 'なし',
      permissionIds: acc.permissions.map(p => p._id.toString()),
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt
    }));
    
    res.json(accountsWithPermissions);
  } catch (err) {
    console.error('Get accounts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アカウント詳細取得
router.get('/:id', async (req, res) => {
  try {
    const account = await Account.findById(req.params.id)
      .populate('permissions', 'name');
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({
      _id: account._id,
      accountId: account.accountId,
      password: '', // セキュリティのため、パスワードは空で返す
      allProjects: account.allProjects,
      permissionIds: account.permissions.map(p => p._id.toString())
    });
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アカウント作成（XSS対策強化版）
router.post('/', async (req, res) => {
  try {
    const { accountId, password, allProjects, permissionIds } = req.body;
    
    // アカウントIDバリデーション
    if (!accountId || !isValidAccountId(accountId)) {
      return res.status(400).json({ error: 'IDは半角英数字で入力してください' });
    }
    
    // スクリプトインジェクション検出
    if (containsScript(accountId)) {
      return res.status(400).json({ 
        error: 'IDにスクリプトを含めることはできません' 
      });
    }
    
    // パスワードバリデーション
    if (!password || !password.match(/^[a-zA-Z0-9!-/:-@¥[-`{-~]+$/)) {
      return res.status(400).json({ error: 'パスワードは半角英数記号で入力してください' });
    }
    
    // 既存アカウントチェック
    const existingAccount = await Account.findOne({ accountId });
    if (existingAccount) {
      return res.status(400).json({ error: 'このIDは既に使用されています' });
    }
    
    const account = new Account({
      accountId,
      password, // pre-saveフックでハッシュ化される
      allProjects: allProjects || false,
      permissions: allProjects ? [] : (permissionIds || [])
    });
    
    const saved = await account.save();
    res.json(saved);
  } catch (err) {
    console.error('Create account error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アカウント更新（XSS対策強化版）
router.put('/:id', async (req, res) => {
  try {
    const { accountId, password, allProjects, permissionIds } = req.body;
    
    // アカウントIDバリデーション
    if (!accountId || !isValidAccountId(accountId)) {
      return res.status(400).json({ error: 'IDは半角英数字で入力してください' });
    }
    
    // スクリプトインジェクション検出
    if (containsScript(accountId)) {
      return res.status(400).json({ 
        error: 'IDにスクリプトを含めることはできません' 
      });
    }
    
    // 既存アカウントチェック（自分以外）
    const existingAccount = await Account.findOne({ 
      accountId, 
      _id: { $ne: req.params.id } 
    });
    
    if (existingAccount) {
      return res.status(400).json({ error: 'このIDは既に使用されています' });
    }
    
    // アカウントを取得
    const account = await Account.findById(req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // フィールドを更新
    account.accountId = accountId;
    account.allProjects = allProjects || false;
    account.permissions = allProjects ? [] : (permissionIds || []);
    account.updatedAt = new Date();
    
    // パスワード処理
    if (password && password.trim() !== '') {
      // パスワードが既にハッシュ化されているかチェック
      const isHashed = password.startsWith('$2b$') || password.startsWith('$2a$');
      
      if (!isHashed) {
        // 平文パスワードの場合のみバリデーション
        if (!password.match(/^[a-zA-Z0-9!-/:-@¥[-`{-~]+$/)) {
          return res.status(400).json({ error: 'パスワードは半角英数記号で入力してください' });
        }
        // 平文パスワードを設定（pre-saveフックでハッシュ化される）
        account.password = password;
      } else {
        // 既にハッシュ化されている場合は変更しない
        console.log('[Account Update] Password unchanged (already hashed)');
      }
    }
    
    // 保存（pre-saveフックが実行される）
    const updated = await account.save();
    
    res.json(updated);
  } catch (err) {
    console.error('Update account error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アカウント削除
router.delete('/:id', async (req, res) => {
  try {
    const account = await Account.findByIdAndDelete(req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
