export default async function handler(req, res) {
  // Add CORS headers to support all origins
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let query = req.body?.query;
  if (!query) {
    try {
      if (typeof req.body === 'string') {
        const parsed = JSON.parse(req.body);
        query = parsed.query;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!query) {
    res.status(400).json({ error: 'Missing query parameter in request body' });
    return;
  }

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout for proxy backend

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        res.status(200).json(data);
        return;
      } else {
        lastError = new Error(`Endpoint ${endpoint} returned status ${response.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  res.status(502).json({
    error: 'All Overpass mirrors failed in serverless function proxy',
    details: lastError?.message || 'Unknown error'
  });
}
