export async function onRequestGet(context) {
  const officialUrl = 'https://everest-media.co/';

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache'
  };

  function stripHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#37;/g, '%')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractNumberNearLabels(text, labels, options = {}) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();

    for (const label of labels) {
      const labelIndex = cleanText.indexOf(label);
      if (labelIndex === -1) continue;

      const before = cleanText.slice(Math.max(0, labelIndex - 220), labelIndex);
      const after = cleanText.slice(labelIndex, Math.min(cleanText.length, labelIndex + 220));
      const context = `${before} ${after}`;
      const matches = context.match(/\d[\d,]*(?:\.\d+)?\s*%?/g) || [];

      const usable = matches.filter((item) => {
        const numeric = Number(String(item).replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(numeric)) return false;
        if (options.percentOnly) return item.includes('%') || numeric <= 100;
        return !item.includes('%') && numeric >= 100;
      });

      if (usable.length) return usable[usable.length - 1];
    }

    return null;
  }

  try {
    const upstream = await fetch(`${officialUrl}?_=${Date.now()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProjectEverestRealtimeBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    if (!upstream.ok) {
      throw new Error(`Official site responded with HTTP ${upstream.status}`);
    }

    const html = await upstream.text();
    const searchableText = `${stripHtml(html)} ${html.replace(/<[^>]+>/g, ' ')}`;

    const studentsRaw = extractNumberNearLabels(searchableText, [
      'นักเรียนในระบบ',
      'Students in the System',
      'Students in System',
      'System Students'
    ]);

    const satisfactionRaw = extractNumberNearLabels(searchableText, [
      'ผู้เรียนพึงพอใจ',
      'Learner Satisfaction',
      'Student Satisfaction',
      'Satisfaction'
    ], { percentOnly: true });

    const students = Number(String(studentsRaw || '').replace(/[^\d.-]/g, ''));
    const satisfaction = Number(String(satisfactionRaw || '').replace(/[^\d.-]/g, ''));

    if (!Number.isFinite(students) || students <= 0) {
      throw new Error('Students metric could not be parsed from official site HTML.');
    }

    return new Response(JSON.stringify({
      ok: true,
      source: officialUrl,
      students: Math.round(students),
      satisfaction: Number.isFinite(satisfaction) && satisfaction > 0 ? Math.round(satisfaction) : 95,
      updatedAt: new Date().toISOString()
    }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      source: officialUrl,
      students: 5259,
      satisfaction: 95,
      updatedAt: new Date().toISOString(),
      error: String(error && error.message ? error.message : error)
    }), { status: 200, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store'
    }
  });
}
