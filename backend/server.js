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

// URLを正規化する関数（プロトコル、www、末尾スラッシュを削除）
function normalizeUrl(url) {
	return url
		.replace(/^https?:\/\//, '')  // プロトコルを削除
		.replace(/^www\./, '')         // wwwを削除
		.replace(/\/$/, '')            // 末尾のスラッシュを削除
		.toLowerCase();                // 小文字に統一
}

app.get('/api/projects', async (req, res) => res.json(await Project.find()));

app.post('/api/projects', async (req, res) => {
	// プロジェクト作成時にURLを正規化
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

		// プロジェクトに関連するログも削除
		const normalizedProjectUrl = normalizeUrl(project.url);
		await Log.deleteMany({
			url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' }
		});

		// プロジェクト自体を削除
		await Project.findByIdAndDelete(req.params.id);

		res.json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		res.status(500).json({ error: err.message });
	}
});

app.get('/api/analytics/:projectId', async (req, res) => {
		const project = await Project.findById(req.params.projectId);
		if (!project) return res.status(404).send('Project not found');

		const { start, end, device, browser, os, language } = req.query;
		
		// 日付をJSTとして解釈し、UTCに戻す（データベース内の日本時間と比較するため）
		const startDate = new Date(start);
		startDate.setHours(0, 0, 0, 0);
		const endDate = new Date(end);
		endDate.setHours(23, 59, 59, 999);

		// 正規化されたプロジェクトURLで検索（部分一致）
		const normalizedProjectUrl = normalizeUrl(project.url);
		const query = {
				url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
				timestamp: { $gte: startDate, $lte: endDate }
		};

		// フィルタを追加
		if (device) query.device = { $in: device.split(',') };
		if (browser) query.browser = { $in: browser.split(',') };
		if (os) query.os = { $in: os.split(',') };
		if (language) query.language = { $in: language.split(',') };

		const [stats, pages, filters] = await Promise.all([
				Log.aggregate([
						{ $match: query },
						{ 
								$group: { 
										_id: null, 
										pv: { $sum: { $cond: [{ $eq: ["$event", "page_view"] }, 1, 0] } },
										uu: { $addToSet: "$userId" } 
								} 
						}
				]),
				Log.aggregate([
						{ $match: { ...query, event: 'page_view' } },
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

		const result = stats[0] || { pv: 0, uu: [] };
		const f = filters[0] || { browsers: [], devices: [], oss: [], languages: [], events: [] };

		res.json({
				pageViews: result.pv,
				uniqueUsers: result.uu ? result.uu.length : 0,
				popularPages: pages.map(p => ({ url: p._id, count: p.count })),
				availableEvents: f.events.filter(e => e !== 'page_view'),
				filters: {
						browsers: f.browsers,
						devices: f.devices,
						oss: f.oss,
						languages: f.languages
				}
		});
});

app.get('/api/analytics/:projectId/event-count', async (req, res) => {
		const project = await Project.findById(req.params.projectId);
		const { start, end, event } = req.query;
		
		const startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
		const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);

		const normalizedProjectUrl = normalizeUrl(project.url);
		const count = await Log.countDocuments({
				url: { $regex: `^${normalizedProjectUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
				event: event,
				timestamp: { $gte: startDate, $lte: endDate }
		});
		res.json({ count });
});

app.post('/track', async (req, res) => {
	console.log('--- New Request ---');
	console.log('Body:', req.body);
	try {
		const agent = useragent.parse(req.headers['user-agent']);
		
		// デバイス分類の詳細化
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
		
		// 現在時刻を日本時間で取得
		const now = toJST(new Date());
		
		// URLを正規化して保存
		const normalizedUrl = normalizeUrl(req.body.url);
		
		const log = new Log({
			userId: req.body.userId,
			url: normalizedUrl,
			event: req.body.event,
			device: deviceType,
			browser: agent.family,
			os: agent.os.family,
			language: req.headers['accept-language']?.split(',')[0].split('-')[0] || 'unknown',
			timestamp: now,
			exitTimestamp: req.body.exitTimestamp ? toJST(new Date(req.body.exitTimestamp)) : null
		});
		
		await log.save();
		console.log('Track saved:', { userId: req.body.userId, event: req.body.event, timestamp: now });
		res.json({ status: 'ok' });
	} catch (err) {
		console.error('Track error:', err);
		res.status(500).json({ error: err.message });
	}
});

// tracker-sdk.js を配信するためのエンドポイント
app.get('/tracker.js', async (req, res) => {
		const origin = req.get('origin') || req.get('referer');
		
		if (!origin) {
				return res.status(403).send('Direct access not allowed');
		}

		try {
				const project = await Project.findById(req.params.projectId);
				
				if (!project) {
						return res.status(404).send('Project not found');
				}
				
				// originとプロジェクトURLを正規化して比較
				const normalizedProjectUrl = normalizeUrl(project.url);
				const normalizedOrigin = normalizeUrl(origin);
				
				if (normalizedOrigin.startsWith(normalizedProjectUrl)) {
						res.setHeader('Content-Type', 'application/javascript');
						res.sendFile(__dirname + '/public/tracker-sdk.js');
				} else {
						console.warn(`Unauthorized access: ${origin} tried to load tracker for ${project.url}`);
						res.status(403).send('Domain not authorized');
				}
		} catch (err) {
				console.error('Server Error:', err);
				res.status(500).send('Server Error');
				}
});

app.listen(3000, () => console.log('Server running on port 3000'));