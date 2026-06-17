async function readQueryFromRequest(req) {
  if (req.method === 'GET') {
    const query = req.query?.query || req.query?.data;
    return typeof query === 'string' ? query : '';
  }

  let query = req.body?.query;
  if (query) return query;

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed?.query) return parsed.query;
    } catch (e) {
      // Ignore malformed body and fall through to empty query.
    }
  }

  return '';
}

async function fetchMirror(endpoint, query, controller) {
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Endpoint ${endpoint} returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data || (!data.elements && !data.remark)) {
      throw new Error(`Endpoint ${endpoint} returned an invalid Overpass payload`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  // Add CORS headers to support all origins
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const query = await readQueryFromRequest(req);
  if (!query) {
    res.status(400).json({ error: 'Missing query parameter in request body' });
    return;
  }

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ].sort(() => Math.random() - 0.5);

  const controllers = endpoints.map(() => new AbortController());
  let resolved = false;

  const attempts = endpoints.map(async (endpoint, index) => {
    try {
      const data = await fetchMirror(endpoint, query, controllers[index]);
      if (!resolved) {
        resolved = true;
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort();
        });
      }
      return data;
    } catch (err) {
      if (!resolved || err.name !== 'AbortError') {
        console.warn(`[api/overpass] ${endpoint} failed: ${err.message}`);
      }
      throw err;
    }
  });

  try {
    const data = await Promise.any(attempts);
    res.status(200).json(data);
  } catch (aggregateErr) {
    res.status(502).json({
      error: 'All Overpass mirrors failed in serverless function proxy',
      details: aggregateErr?.errors?.[aggregateErr.errors.length - 1]?.message || 'Unknown error'
    });
  }
}
