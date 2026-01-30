const express = require('express');
const crypto = require('crypto');
const Project = require('../models/Project');
const Log = require('../models/Log');
const ABTestLog = require('../models/ABTestLog');
const { normalizeUrl } = require('../utils/urlUtils');
const { escapeHtml, isValidUrl, containsScript } = require('../utils/sanitize');

const router = express.Router();

// プロジェクト一覧取得
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find();
    res.json(projects);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: err.message });
  }
});

// プロジェクト作成（XSS対策強化版）
router.post('/', async (req, res) => {
  try {
    const { name, url } = req.body;
    
    // バリデーション
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'プロジェクト名は必須です' });
    }
    
    // スクリプトインジェクション検出
    if (containsScript(name)) {
      return res.status(400).json({ 
        error: 'プロジェクト名にスクリプトを含めることはできません' 
      });
    }
    
    // URL検証
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: '有効なURLを入力してください' });
    }
    
    const apiKey = crypto.randomBytes(32).toString('hex');
    const normalizedUrl = normalizeUrl(url);
    
    const project = new Project({
      name: escapeHtml(name), // HTMLエスケープ
      url: normalizedUrl,
      apiKey: apiKey
    });

    const saved = await project.save();
    res.json(saved);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: err.message });
  }
});

// プロジェクト削除
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await Log.deleteMany({ projectId: project._id });
    await ABTestLog.deleteMany({ projectId: project._id });
    await Project.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
