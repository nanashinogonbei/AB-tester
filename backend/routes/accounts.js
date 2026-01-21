const express = require('express');
const Account = require('../models/Account');
const Project = require('../models/Project');

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
      password: account.password,
      allProjects: account.allProjects,
      permissionIds: account.permissions.map(p => p._id.toString())
    });
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アカウント作成
router.post('/', async (req, res) => {
  try {
    const { accountId, password, allProjects, permissionIds } = req.body;
    
    if (!accountId || !accountId.match(/^[a-zA-Z0-9]+$/)) {
      return res.status(400).json({ error: 'IDは半角英数字で入力してください' });
    }
    
    if (!password || !password.match(/^[a-zA-Z0-9!-/:-@¥[-`{-~]+$/)) {
      return res.status(400).json({ error: 'パスワードは半角英数記号で入力してください' });
    }
    
    const existingAccount = await Account.findOne({ accountId });
    if (existingAccount) {
      return res.status(400).json({ error: 'このIDは既に使用されています' });
    }
    
    const account = new Account({
      accountId,
      password,
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

// アカウント更新
router.put('/:id', async (req, res) => {
  try {
    const { accountId, password, allProjects, permissionIds } = req.body;
    
    if (!accountId || !accountId.match(/^[a-zA-Z0-9]+$/)) {
      return res.status(400).json({ error: 'IDは半角英数字で入力してください' });
    }
    
    if (!password || !password.match(/^[a-zA-Z0-9!-/:-@¥[-`{-~]+$/)) {
      return res.status(400).json({ error: 'パスワードは半角英数記号で入力してください' });
    }
    
    const existingAccount = await Account.findOne({ 
      accountId, 
      _id: { $ne: req.params.id } 
    });
    
    if (existingAccount) {
      return res.status(400).json({ error: 'このIDは既に使用されています' });
    }
    
    const account = await Account.findByIdAndUpdate(
      req.params.id,
      {
        accountId,
        password,
        allProjects: allProjects || false,
        permissions: allProjects ? [] : (permissionIds || []),
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(account);
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