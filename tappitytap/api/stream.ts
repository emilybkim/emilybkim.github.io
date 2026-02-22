// Vercel serverless proxy for Durable Streams
// Proxies /api/stream requests to Electric Cloud, adding the auth token server-side.
// The browser never sees the token — it stays in the Vercel environment variable.

const STREAM_SERVICE_ID = process.env.STREAM_SERVICE_ID || ''
const STREAM_SECRET = process.env.STREAM_SECRET || ''
const UPSTREAM = `https://api.electric-sql.cloud/v1/stream/${STREAM_SERVICE_ID}/tappitytap-v4`

export const config = {
  // Use Edge Runtime for low-latency streaming support
  runtime: 'edge',
}

export default async function handler(request: Request): Promise<Response> {
  // Build upstream URL, preserving query parameters
  const url = new URL(request.url)
  const upstream = new URL(UPSTREAM)
  upstream.search = url.search

  // Forward the request to Electric Cloud with auth header
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${STREAM_SECRET}`)
  // Remove host header so it doesn't conflict with upstream
  headers.delete('host')

  const upstreamResponse = await fetch(upstream.toString(), {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    // @ts-expect-error — duplex is needed for streaming request bodies
    duplex: request.method !== 'GET' && request.method !== 'HEAD' ? 'half' : undefined,
  })

  // Forward the response back, preserving headers (especially Stream-Next-Offset)
  const responseHeaders = new Headers(upstreamResponse.headers)
  // Allow browser to read stream headers
  responseHeaders.set('Access-Control-Expose-Headers', 'Stream-Next-Offset, Content-Type')

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })
}
