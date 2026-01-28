const express = require('express');
const useragent = require('useragent');
const fs = require('fs');
const path = require('path');
const Project = require('../models/Project');
const Log = require('../models/Log');
const { toJST } = require('../utils/dateUtils');
const { normalizeUrl, findProjectByUrl } = require('../utils/urlUtils');

const router = express.Router();

// すべてのルートに対してCORSミドルウェアを適用
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  next();
});

// OPTIONSリクエストのハンドリング（プリフライト）
router.options('*', (req, res) => {
  res.status(204).send();
});

// SDK配信
router.get('/:projectId.js', async (req, res) => {
  try {
    console.log(`[SDK] Request for project ${req.params.projectId} from origin: ${req.get('origin') || req.get('referer')}`);
    
    const project = await Project.findById(req.params.projectId);
    if (!project) {
      console.error(`[SDK] Project not found: ${req.params.projectId}`);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.status(404).send('// Project not found');
    }

    // 追加のヘッダー設定
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const templatePath = path.join(__dirname, '..', 'public', 'tracker-sdk-template.js');
    
    if (!fs.existsSync(templatePath)) {
      console.error(`[SDK] Template not found: ${templatePath}`);
      return res.status(500).send('// Template not found');
    }
    
    let sdkTemplate = fs.readFileSync(templatePath, 'utf8');
    const host = req.get('host');

    const customizedSdk = sdkTemplate
      .replace('{{PROJECT_ID}}', project._id.toString())
      .replace('{{API_KEY}}', project.apiKey)
      .replace('{{SERVER_HOST}}', host);

    console.log(`[SDK] Successfully delivered SDK for project ${project._id}`);
    res.send(customizedSdk);
  } catch (err) {
    console.error('[SDK] Error:', err);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.status(500).send('// Server Error');
  }
});

// トラッキング
router.post('/', async (req, res) => {
  try {
    let data = req.body;
    
    // bodyが空でrawBodyがある場合（sendBeaconの場合）
    if ((!data || Object.keys(data).length === 0) && req.rawBody) {
      try {
        data = JSON.parse(req.rawBody);
      } catch (e) {
        console.error('[Track] Failed to parse rawBody:', e);
      }
    }

    const { projectId, apiKey, userId, url, event, exitTimestamp } = data;

    if (!projectId || !apiKey || !userId || !url || !event) {
      console.error('[Track] Missing parameters:', { projectId, apiKey, userId, url, event });
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const project = await Project.findOne({ _id: projectId, apiKey: apiKey });
    if (!project) {
      console.warn(`[Track] Invalid credentials: projectId=${projectId}`);
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    const normalizedRequestUrl = normalizeUrl(url);
    const normalizedProjectUrl = normalizeUrl(project.url);
    if (!normalizedRequestUrl.startsWith(normalizedProjectUrl)) {
      console.warn(`[Track] URL mismatch: ${url} does not match project ${project.url}`);
      return res.status(403).json({ error: 'URL mismatch' });
    }

    const agent = useragent.parse(req.headers['user-agent']);

    let deviceType = 'other';
    const deviceFamily = agent.device.family;

    if (deviceFamily === 'Other' || deviceFamily === 'Desktop') {
      deviceType = 'PC';
    } else if (deviceFamily.includes('iPad') || deviceFamily.includes('Tablet')) {
      deviceType = 'Tablet';
    } else if (deviceFamily.includes('iPhone') || deviceFamily.includes('Android') ||
      deviceFamily.includes('Mobile')) {
      deviceType = 'SP';
    }

    const jstNow = toJST(new Date());

    const log = new Log({
      projectId: project._id,
      userId: userId,
      url: url,
      event: event,
      device: deviceType,
      browser: agent.family,
      os: agent.os.family,
      language: req.headers['accept-language']?.split(',')[0].split('-')[0] || 'unknown',
      timestamp: jstNow,
      exitTimestamp: exitTimestamp ? toJST(new Date(exitTimestamp)) : null
    });

    await log.save();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Track] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;