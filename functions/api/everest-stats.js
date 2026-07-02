const OFFICIAL_BASE = 'https://everest-media.co';
const OFFICIAL_URL = 'https://everest-media.co/';

const LATEST_KNOWN = {
  students: 5282,
  satisfaction: 95
};

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache'
};

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const debugMode = requestUrl.searchParams.has('debug');

  const debug = {
    fetchedUrls: [],
    discoveredUrls: [],
    textLength: 0,
    studentsCandidates: [],
    satisfactionCandidates: []
  };

  try {
    const collectedTexts = [];

    const mainHtml = await fetchText(`${OFFICIAL_URL}?_=${Date.now()}`, debug);
    collectedTexts.push(mainHtml);

    const firstRoundUrls = discoverUsefulUrls(mainHtml);
    debug.discoveredUrls.push(...firstRoundUrls);

    const firstRoundTexts = await fetchManyTexts(firstRoundUrls.slice(0, 20), debug);
    collectedTexts.push(...firstRoundTexts);

    const secondRoundUrls = discoverUsefulUrls(firstRoundTexts.join('\n'))
      .filter((url) => !firstRoundUrls.includes(url));

    debug.discoveredUrls.push(...secondRoundUrls);

    const secondRoundTexts = await fetchManyTexts(secondRoundUrls.slice(0, 12), debug);
    collectedTexts.push(...secondRoundTexts);

    const searchableText = normalizeSearchText(collectedTexts.join('\n'));
    debug.textLength = searchableText.length;

    const students = extractStudents(searchableText, debug);
    const satisfaction = extractSatisfaction(searchableText, debug);

    if (!Number.isFinite(students) || students <= 0) {
      throw new Error('Students metric could not be parsed from official site HTML, JS, or discovered data files.');
    }

    const payload = {
      ok: true,
      source: OFFICIAL_URL,
      students: Math.round(students),
      satisfaction: Number.isFinite(satisfaction) && satisfaction > 0
        ? Math.round(satisfaction)
        : LATEST_KNOWN.satisfaction,
      updatedAt: new Date().toISOString()
    };

    if (debugMode) payload.debug = debug;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: RESPONSE_HEADERS
    });

  } catch (error) {
    const payload = {
      ok: false,
      source: OFFICIAL_URL,
      students: LATEST_KNOWN.students,
      satisfaction: LATEST_KNOWN.satisfaction,
      updatedAt: new Date().toISOString(),
      error: String(error && error.message ? error.message : error)
    };

    if (debugMode) payload.debug = debug;

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: RESPONSE_HEADERS
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: RESPONSE_HEADERS
  });
}

async function fetchText(url, debug) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProjectEverestRealtimeBot/2.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,text/plain,*/*',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      },
      signal: controller.signal
    });

    const text = await response.text();

    debug.fetchedUrls.push({
      url,
      status: response.status,
      ok: response.ok,
      length: text.length
    });

    if (!response.ok) {
      throw new Error(`Fetch failed ${response.status} for ${url}`);
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchManyTexts(urls, debug) {
  const uniqueUrls = Array.from(new Set(urls)).slice(0, 24);

  const results = await Promise.allSettled(
    uniqueUrls.map((url) => fetchText(url, debug))
  );

  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
}

function discoverUsefulUrls(text) {
  const source = String(text || '');
  const urls = new Set();

  const attrPattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let attrMatch;

  while ((attrMatch = attrPattern.exec(source)) !== null) {
    addIfUsefulUrl(attrMatch[1], urls);
  }

  const stringPattern = /["'`]((?:https?:\/\/everest-media\.co|\/)[^"'`\s<>]+)["'`]/gi;
  let stringMatch;

  while ((stringMatch = stringPattern.exec(source)) !== null) {
    addIfUsefulUrl(stringMatch[1], urls);
  }

  return Array.from(urls);
}

function addIfUsefulUrl(rawUrl, urls) {
  try {
    if (!rawUrl) return;

    const cleanRaw = String(rawUrl)
      .replace(/\\u002F/g, '/')
      .replace(/&amp;/g, '&')
      .trim();

    if (
      cleanRaw.startsWith('data:') ||
      cleanRaw.startsWith('mailto:') ||
      cleanRaw.startsWith('tel:') ||
      cleanRaw.includes('#')
    ) {
      return;
    }

    const absoluteUrl = new URL(cleanRaw, OFFICIAL_BASE).toString();

    if (!absoluteUrl.startsWith(OFFICIAL_BASE)) return;

    const lower = absoluteUrl.toLowerCase();

    const blockedExtensions = [
      '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
      '.ico', '.woff', '.woff2', '.ttf', '.otf', '.css',
      '.mp4', '.mov', '.webm', '.pdf'
    ];

    if (blockedExtensions.some((ext) => lower.includes(ext))) return;

    const usefulHints = [
      '.js',
      '.json',
      'api',
      'stats',
      'stat',
      'student',
      'learner',
      'course',
      'home',
      'setting',
      'wp-json',
      '_next',
      'nuxt',
      'assets',
      'build'
    ];

    if (usefulHints.some((hint) => lower.includes(hint))) {
      urls.add(absoluteUrl);
    }
  } catch (_) {
    // Skip invalid URLs silently.
  }
}

function normalizeSearchText(input) {
  return String(input || '')
    .replace(/\\u003C/gi, '<')
    .replace(/\\u003E/gi, '>')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#37;/gi, '%')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/<script[\s\S]*?<\/script>/gi, (match) => ` ${match} `)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(raw) {
  if (raw === null || raw === undefined) return NaN;

  return Number(
    String(raw)
      .replace(/,/g, '')
      .replace(/[^\d.]/g, '')
  );
}

function extractStudents(text, debug) {
  const labels = [
    'นักเรียนในระบบ',
    'นักเรียน',
    'Live Students',
    'Students in the System',
    'Students in System',
    'System Students',
    'students',
    'student_count',
    'students_count',
    'total_students',
    'totalStudents',
    'studentCount',
    'learners',
    'learner_count',
    'users'
  ];

  const fromLabels = extractClosestNumberNearLabels(text, labels, {
    min: 1000,
    max: 999999,
    rejectPercent: true,
    debugList: debug.studentsCandidates,
    metric: 'students'
  });

  if (Number.isFinite(fromLabels)) return fromLabels;

  const patterns = [
    /(?:studentCount|totalStudents|studentsCount|students|learners|users|student_count|students_count|total_students|learner_count)["'\s:=]{0,20}["']?(\d{1,3}(?:,\d{3})+|\d{4,7})/gi,
    /["'](?:studentCount|totalStudents|studentsCount|students|learners|users|student_count|students_count|total_students|learner_count)["']\s*:\s*["']?(\d{1,3}(?:,\d{3})+|\d{4,7})/gi,
    /(\d{1,3}(?:,\d{3})+|\d{4,7})\s*(?:นักเรียนในระบบ|นักเรียน|students|learners)/gi
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const value = parseNumber(match[1]);

      debug.studentsCandidates.push({
        source: 'pattern',
        raw: match[1],
        value
      });

      if (Number.isFinite(value) && value >= 1000 && value <= 999999) {
        return value;
      }
    }
  }

  return NaN;
}

function extractSatisfaction(text, debug) {
  const labels = [
    'ผู้เรียนพึงพอใจ',
    'ความพึงพอใจ',
    'Satisfaction',
    'Learner Satisfaction',
    'Student Satisfaction',
    'satisfaction',
    'satisfaction_rate',
    'satisfactionRate'
  ];

  const fromLabels = extractClosestNumberNearLabels(text, labels, {
    min: 1,
    max: 100,
    allowPercent: true,
    debugList: debug.satisfactionCandidates,
    metric: 'satisfaction'
  });

  if (Number.isFinite(fromLabels)) return fromLabels;

  const patterns = [
    /(?:satisfactionRate|satisfaction|satisfaction_rate)["'\s:=]{0,20}["']?(\d{1,3})\s*%?/gi,
    /["'](?:satisfactionRate|satisfaction|satisfaction_rate)["']\s*:\s*["']?(\d{1,3})\s*%?/gi,
    /(\d{1,3})\s*%\s*(?:ผู้เรียนพึงพอใจ|ความพึงพอใจ|satisfaction)/gi
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const value = parseNumber(match[1]);

      debug.satisfactionCandidates.push({
        source: 'pattern',
        raw: match[1],
        value
      });

      if (Number.isFinite(value) && value >= 1 && value <= 100) {
        return value;
      }
    }
  }

  return LATEST_KNOWN.satisfaction;
}

function extractClosestNumberNearLabels(text, labels, options) {
  const cleanText = String(text || '');
  const numberPattern = /\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d{4,7}(?:\.\d+)?%?|\d{1,3}%/g;

  let best = null;

  for (const label of labels) {
    const lowerText = cleanText.toLowerCase();
    const lowerLabel = String(label).toLowerCase();

    let searchStart = 0;
    let labelIndex;

    while ((labelIndex = lowerText.indexOf(lowerLabel, searchStart)) !== -1) {
      const windowStart = Math.max(0, labelIndex - 260);
      const windowEnd = Math.min(cleanText.length, labelIndex + lowerLabel.length + 260);
      const context = cleanText.slice(windowStart, windowEnd);

      let numberMatch;

      while ((numberMatch = numberPattern.exec(context)) !== null) {
        const raw = numberMatch[0];
        const value = parseNumber(raw);
        const absoluteNumberIndex = windowStart + numberMatch.index;
        const distance = Math.abs(absoluteNumberIndex - labelIndex);

        const hasPercent = raw.includes('%');

        if (!Number.isFinite(value)) continue;
        if (options.rejectPercent && hasPercent) continue;
        if (!options.allowPercent && hasPercent) continue;
        if (value < options.min || value > options.max) continue;

        const candidate = {
          source: 'near-label',
          metric: options.metric,
          label,
          raw,
          value,
          distance
        };

        options.debugList.push(candidate);

        if (!best || distance < best.distance) {
          best = candidate;
        }
      }

      searchStart = labelIndex + lowerLabel.length;
    }
  }

  return best ? best.value : NaN;
}
