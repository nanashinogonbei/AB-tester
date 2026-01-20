const express = require('express');
const crypto = require('crypto');
const Project = require('../models/Project');
const Log = require('../models/Log');
const ABTestLog = require('../models/ABTestLog');
const { normalizeUrl } = require('../utils/urlUtils');

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

// プロジェクト作成
router.post('/', async (req, res) => {
  try {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const normalizedUrl = normalizeUrl(req.body.url);
    
    const project = new Project({
      name: req.body.name,
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
