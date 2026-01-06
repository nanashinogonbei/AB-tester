const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const useragent = require('useragent');

const app = express();
app.use(cors());
app.use(express.json({ type: '*/*' }));
app.use(express.static('public'));

mongoose.connect('mongodb://mongodb:27017/trackerDB');

const projectSchema = new mongoose.Schema({ name: String, url: String });
const Project = mongoose.model('Project', projectSchema);

const logSchema = new mongoose.Schema({
	userId: String,
	url: String,
	event: String,
	device: String,
	browser: String,
	os: String,
	language: String,
	timestamp: { type: Date, default: Date.now },
	exitTimestamp: Date
});
const Log = mongoose.model('Log', logSchema);

// 日本時間（UTC+9）に変換する関数
function toJST(date) {
	const utcDate = new Date(date);
	return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// URLを正規化する関数
function normalizeUrl(url) {
	return url
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/\/$/, '')
		.toLowerCase();
}

app.get('/api/projects', async (req, res) => res.json(await Project.find()));

app.post('/api/projects', async (req, res) => {
	const normalizedUrl = normalizeUrl(req.body.url);
	const project = new Project({
		name: req.body.name,
		url: normalizedUrl
	});
	res.json(await project.save());
});

app.delete('/api/projects/:id', async (req, res) => {
	try {
		const project = await Project.findById(req.params.id);
		if (!project) {
			return res.status(404).json({ error: 'Project not found' });
		}

		const normalizedProjectUrl = normalizeUrl(project.url);
		await Log.deleteMany({
			url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' }
		});

		await Project.findByIdAndDelete(req.params.id);
		res.json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/analytics/:projectId', async (req, res) => {
	try {
		const project = await Project.findById(req.params.projectId);
		if (!project) return res.status(404).send('Project not found');

		const { start, end, device, browser, os, language } = req.query;
		
		// 日本時間の日付範囲をそのまま使用（タイムゾーン変換なし）
		const startDate = new Date(start + 'T00:00:00.000Z');
		const endDate = new Date(end + 'T23:59:59.999Z');
		console.log(`start:${start} - end:${end}`);
		console.log(`startDate:${startDate} - endDate:${endDate}`);

		const normalizedProjectUrl = normalizeUrl(project.url);
		const query = {
			url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
			timestamp: { $gte: startDate, $lte: endDate }
		};

		if (device) query.device = { $in: device.split(',') };
		if (browser) query.browser = { $in: browser.split(',') };
		if (os) query.os = { $in: os.split(',') };
		if (language) query.language = { $in: language.split(',') };

		// デバッグ：プロジェクトの全ログを確認
		const allLogs = await Log.find({
			url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' }
		}).sort({ timestamp: -1 }).limit(10);

		const [stats, pages, filters] = await Promise.all([
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
				{ $match: { url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } } },
				{ $group: { 
					_id: null,
					browsers: { $addToSet: "$browser" },
					devices: { $addToSet: "$device" },
					oss: { $addToSet: "$os" },
					languages: { $addToSet: "$language" },
					events: { $addToSet: "$event" }
				}}
			])
		]);

		const result = stats[0] || { pv: 0, fv: 0, uu: [] };
		const f = filters[0] || { browsers: [], devices: [], oss: [], languages: [], events: [] };

		res.json({
			pageViews: result.pv + result.fv,
			uniqueUsers: result.uu ? result.uu.length : 0,
			popularPages: pages.map(p => ({ url: p._id, count: p.count })),
			availableEvents: f.events.filter(e => e !== 'page_view' && e !== 'first_view' && e !== 'page_leave'),
			filters: {
				browsers: f.browsers.filter(Boolean),
				devices: f.devices.filter(Boolean),
				oss: f.oss.filter(Boolean),
				languages: f.languages.filter(Boolean)
			}
		});
	} catch (err) {
		console.error('Analytics error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/analytics/:projectId/event-count', async (req, res) => {
	try {
		const project = await Project.findById(req.params.projectId);
		if (!project) return res.status(404).send('Project not found');
		
		const { start, end, event } = req.query;
		
		// 日本時間の日付範囲をそのまま使用
		const startDate = new Date(start + 'T00:00:00.000Z');
		const endDate = new Date(end + 'T23:59:59.999Z');

		const normalizedProjectUrl = normalizeUrl(project.url);
		const count = await Log.countDocuments({
			url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
			event: event,
			timestamp: { $gte: startDate, $lte: endDate }
		});
		
		res.json({ count });
	} catch (err) {
		console.error('Event count error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.post('/track', async (req, res) => {
	try {
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
		
		// 日本時間で保存（UTC+9時間）
		const jstNow = toJST(new Date());
		const normalizedUrl = normalizeUrl(req.body.url);
		
		const log = new Log({
			userId: req.body.userId,
			url: normalizedUrl,
			event: req.body.event,
			device: deviceType,
			browser: agent.family,
			os: agent.os.family,
			language: req.headers['accept-language']?.split(',')[0].split('-')[0] || 'unknown',
			timestamp: jstNow,  // 日本時間で保存
			exitTimestamp: req.body.exitTimestamp ? toJST(new Date(req.body.exitTimestamp)) : null
		});
		
		await log.save();
		res.json({ status: 'ok' });
	} catch (err) {
		console.error('Track error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/tracker.js', async (req, res) => {
	const origin = req.get('origin') || req.get('referer');
	
	if (!origin) {
		res.setHeader('Content-Type', 'application/javascript');
		return res.sendFile(__dirname + '/public/tracker-sdk.js');
	}

	try {
		const projects = await Project.find();
		const normalizedOrigin = normalizeUrl(origin);
		
		const isAuthorized = projects.some(project => {
			const normalizedProjectUrl = normalizeUrl(project.url);
			const matches = normalizedOrigin.startsWith(normalizedProjectUrl) || 
			                normalizedProjectUrl.startsWith(normalizedOrigin);
			return matches;
		});
		
		if (isAuthorized) {
			res.setHeader('Content-Type', 'application/javascript');
			res.sendFile(__dirname + '/public/tracker-sdk.js');
		} else {
			console.warn(`Unauthorized access: ${origin} is not registered`);
			res.status(403).send('Domain not authorized');
		}
	} catch (err) {
		console.error('Tracker.js Error:', err);
		res.status(500).send('Server Error');
	}
});

app.listen(3000, () => console.log('Server running on port 3000'));