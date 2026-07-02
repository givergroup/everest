const OFFICIAL_STATS_API = 'https://everest-media.co/api/home-stats';

const FALLBACK = {
  students: 5293,
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

export async function onRequestGet() {
  try {
    const response = await fetch(`${OFFICIAL_STATS_API}?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (compatible; ProjectEverestRealtimeBot/3.0)'
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error(`Official stats API responded with HTTP ${response.status}`);
    }

    const data = await response.json();

    const students =
      Number(data?.data?.total_students) ||
      Number(data?.total_students) ||
      Number(data?.students);

    const satisfaction =
      Number(data?.data?.satisfaction) ||
      Number(data?.data?.satisfaction_rate) ||
      Number(data?.satisfaction) ||
      FALLBACK.satisfaction;

    if (!Number.isFinite(students) || students <= 0) {
      throw new Error('total_students could not be parsed from official home-stats API.');
    }

    return new Response(JSON.stringify({
      ok: true,
      source: OFFICIAL_STATS_API,
      students: Math.round(students),
      satisfaction: Number.isFinite(satisfaction) && satisfaction > 0
        ? Math.round(satisfaction)
        : FALLBACK.satisfaction,
      updatedAt: new Date().toISOString(),
      raw: data
    }), {
      status: 200,
      headers: RESPONSE_HEADERS
    });

  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      source: OFFICIAL_STATS_API,
      students: FALLBACK.students,
      satisfaction: FALLBACK.satisfaction,
      updatedAt: new Date().toISOString(),
      error: String(error && error.message ? error.message : error)
    }), {
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
