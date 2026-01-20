const express = require('express');
const Project = require('../models/Project');
const Log = require('../models/Log');
const Suggestion = require('../models/Suggestion');

const router = express.Router();

// サジェスト取得
router.get('/suggestions', async (req, res) => {
  try {
    let suggestion = await Suggestion.findOne();

    if (!suggestion) {
      suggestion = {
        devices: [],
        browsers: [],
        oss: [],
        languages: [],
        updatedAt: new Date()
      };
    }

    res.json(suggestion);
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// アナリティクス取得
router.get('/:projectId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).send('Project not found');

    const { start, end, device, browser, os, language } = req.query;

    const startDate = new Date(start + 'T00:00:00.000Z');
    const endDate = new Date(end + 'T23:59:59.999Z');

    const query = {
      projectId: project._id,
      timestamp: { $gte: startDate, $lte: endDate }
    };

    if (device) query.device = { $in: device.split(',') };
    if (browser) query.browser = { $in: browser.split(',') };
    if (os) query.os = { $in: os.split(',') };
    if (language) query.language = { $in: language.split(',') };

    const [stats, pages, events] = await Promise.all([
      Log.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            pv: { $sum: { $cond: [{ $eq: ["$event", "page_view"] }, 1, 0] } },
            fv: { $sum: { $cond: [{ $eq: ["$event", "first_view"] }, 1, 0] } },
            uu: { $addToSet: "$userId" }
          }
        }
      ]),
      Log.aggregate([
        { $match: { ...query, event: { $in: ['page_view', 'first_view'] } } },
        { $group: { _id: "$url", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Log.aggregate([
        { $match: { projectId: project._id } },
        { $group: { _id: null, events: { $addToSet: "$event" } } }
      ])
    ]);

    const result = stats[0] || { pv: 0, fv: 0, uu: [] };
    const e = events[0] || { events: [] };

    res.json({
      pageViews: result.pv + result.fv,
      uniqueUsers: result.uu ? result.uu.length : 0,
      popularPages: pages.map(p => ({ url: p._id, count: p.count })),
      availableEvents: e.events.filter(ev => 
        ev !== 'page_view' && ev !== 'first_view' && ev !== 'page_leave'
      )
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// イベントカウント取得
router.get('/:projectId/event-count', async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).send('Project not found');

    const { start, end, event } = req.query;

    const startDate = new Date(start + 'T00:00:00.000Z');
    const endDate = new Date(end + 'T23:59:59.999Z');

    const count = await Log.countDocuments({
      projectId: project._id,
      event: event,
      timestamp: { $gte: startDate, $lte: endDate }
    });

    res.json({ count });
  } catch (err) {
    console.error('Event count error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
