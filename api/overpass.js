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

async function fetchMirror(endpoint, query, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const userAgent = 'RealCity3000/1.0 (https://realcity3000.vercel.app; treed@example.com)';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent,
        'Accept': 'application/json'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || (!data.elements && !data.remark)) {
      throw new Error('Invalid JSON payload');
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

  // Use only the 2 most reliable mirrors to allow larger timeout budgets
  // Total maximum execution time: 5000 + 4000 = 9000ms (fits under Vercel 10s limit)
  const mirrors = [
    { url: 'https://overpass-api.de/api/interpreter', timeout: 5000 },
    { url: 'https://overpass.private.coffee/api/interpreter', timeout: 4000 }
  ];

  const errors = [];
  
  // Try each mirror sequentially
  for (const mirror of mirrors) {
    try {
      const start = Date.now();
      const data = await fetchMirror(mirror.url, query, mirror.timeout);
      console.log(`[api/overpass] ${mirror.url} succeeded in ${Date.now() - start}ms`);
      res.status(200).json(data);
      return;
    } catch (err) {
      const reason = err.name === 'AbortError' ? `Timeout (${mirror.timeout}ms)` : err.message;
      console.warn(`[api/overpass] ${mirror.url} failed: ${reason}`);
      errors.push(`${mirror.url.split('/')[2]}: ${reason}`);
    }
  }

  // All mirrors failed
  res.status(502).json({
    error: 'All Overpass mirrors failed in serverless function proxy',
    details: errors.join(', ')
  });
}
