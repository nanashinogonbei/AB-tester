const { matchUrl } = require('./urlUtils');

// 条件チェック関数
function checkConditions(conditions, context) {
  if (!conditions) return true;

  const conditionTypes = ['device', 'browser', 'os', 'language'];

  for (const type of conditionTypes) {
    if (conditions[type] && conditions[type].length > 0) {
      const validConditions = conditions[type].filter(c => c.value && c.value.trim() !== '');

      if (validConditions.length === 0) continue;

      const matched = checkConditionArray(validConditions, context[type]);
      if (!matched) {
        console.log(`  → ${type}条件にマッチしない:`, context[type]);
        return false;
      }
    }
  }

  if (conditions.other && conditions.other.length > 0) {
    for (const cond of conditions.other) {
      const requiredVisitCount = parseInt(cond.visitCount) || 0;
      if (context.visitCount < requiredVisitCount) {
        console.log(`  → 訪問回数条件にマッチしない: ${context.visitCount} < ${requiredVisitCount}`);
        return false;
      }

      if (cond.referrer && cond.referrer.trim() !== '') {
        if (!matchUrl(context.referrer, cond.referrer)) {
          console.log(`  → リファラー条件にマッチしない: ${context.referrer}`);
          return false;
        }
      }
    }
  }

  return true;
}

function checkConditionArray(conditions, value) {
  for (const cond of conditions) {
    if (checkSingleCondition(cond, value)) {
      return true;
    }
  }
  return false;
}

function checkSingleCondition(condition, value) {
  const condValue = condition.value || '';
  const condType = condition.condition || 'exact';

  switch (condType) {
    case 'exact':
      return value === condValue;
    case 'contains':
      return value.includes(condValue);
    case 'startsWith':
      return value.startsWith(condValue);
    case 'endsWith':
      return value.endsWith(condValue);
    case 'regex':
      try {
        return new RegExp(condValue).test(value);
      } catch (e) {
        console.error('Regex error:', e);
        return false;
      }
    case 'oneOf':
      return (condition.values || []).includes(value);
    case 'notRegex':
      try {
        return !new RegExp(condValue).test(value);
      } catch (e) {
        return true;
      }
    case 'notStartsWith':
      return !value.startsWith(condValue);
    case 'notEndsWith':
      return !value.endsWith(condValue);
    case 'notContains':
      return !value.includes(condValue);
    case 'notOneOf':
      return !(condition.values || []).includes(value);
    default:
      return false;
  }
}

// クリエイティブ選択関数
function selectCreative(creatives) {
  if (!creatives || creatives.length === 0) return null;
  const totalDistribution = creatives.reduce((sum, c) => sum + (c.distribution || 0), 0);

  if (totalDistribution === 0) {
    console.log('[ABTest] 配分が0のため最初のクリエイティブを使用');
    return {
      index: 0,
      creative: creatives[0]
    };
  }

  let random = Math.random() * totalDistribution;

  for (let i = 0; i < creatives.length; i++) {
    random -= (creatives[i].distribution || 0);
    if (random <= 0) {
      return {
        index: i,
        creative: creatives[i]
      };
    }
  }

  return {
    index: 0,
    creative: creatives[0]
  };
}

module.exports = { checkConditions, selectCreative };
