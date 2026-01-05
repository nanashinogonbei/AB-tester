(function () {
	const currentScript = document.currentScript || document.querySelector('script[src*="tracker-sdk.js"]');
	const scriptUrl = currentScript ? currentScript.src : '';
	const SERVER_URL = scriptUrl ? new URL(scriptUrl).origin : window.location.origin;

	let userId = localStorage.getItem('tracker_user_id');
	let isFirstVisit = false;
	
	if (!userId) {
		userId = 'user_' + Math.random().toString(36).substr(2, 9);
		localStorage.setItem('tracker_user_id', userId);
		isFirstVisit = true;
	}

	window.trackerEvent = function (eventName, isExit = false) {
		const data = {
			userId: userId,
			url: window.location.href,
			event: eventName,
			exitTimestamp: isExit ? new Date().toISOString() : null
		};

		const payload = JSON.stringify(data);

		if (isExit) {
			navigator.sendBeacon(`${SERVER_URL}/track`, payload);
		} else {
			fetch(`${SERVER_URL}/track`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: payload,
				keepalive: true
			}).catch(err => console.error('Tracker error:', err));
		}
	};

	// 初回訪問時は first_view、それ以外は page_view
	trackerEvent(isFirstVisit ? 'first_view' : 'page_view');

	window.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			trackerEvent('page_leave', true);
		}
	});
	
	window.addEventListener('pagehide', () => {
		trackerEvent('page_leave', true);
	});
})();