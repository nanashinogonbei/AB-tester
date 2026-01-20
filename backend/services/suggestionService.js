const Log = require('../models/Log');
const Suggestion = require('../models/Suggestion');

// サジェストデータを更新する関数
async function updateSuggestions() {
  try {
    console.log('[Suggestion Update] Starting at', new Date().toISOString());

    const uniqueValues = await Log.aggregate([{
      $group: {
        _id: null,
        devices: { $addToSet: '$device' },
        browsers: { $addToSet: '$browser' },
        oss: { $addToSet: '$os' },
        languages: { $addToSet: '$language' }
      }
    }]);

    if (uniqueValues.length === 0) {
      console.log('[Suggestion Update] No data found');
      return;
    }

    const data = uniqueValues[0];

    const cleanAndSort = (arr) => {
      return arr
        .filter(v => v && v.trim() !== '')
        .sort((a, b) => a.localeCompare(b));
    };

    const suggestionData = {
      devices: cleanAndSort(data.devices),
      browsers: cleanAndSort(data.browsers),
      oss: cleanAndSort(data.oss),
      languages: cleanAndSort(data.languages),
      updatedAt: new Date()
    };

    await Suggestion.findOneAndUpdate(
      {},
      suggestionData,
      { upsert: true, new: true }
    );

    console.log('[Suggestion Update] Completed', {
      devices: suggestionData.devices.length,
      browsers: suggestionData.browsers.length,
      oss: suggestionData.oss.length,
      languages: suggestionData.languages.length
    });
  } catch (err) {
    console.error('[Suggestion Update] Error:', err);
  }
}

module.exports = { updateSuggestions };
