// Cloudflare Pages Function: same-origin proxy for the authenticated HIBP v3
// breach API. The authenticated API has no CORS support, so the browser cannot
// call haveibeenpwned.com directly; this forwards the request (and the user's
// own API key header) from the same origin instead. No key is stored here.

const HIBP_API_BASE = 'https://haveibeenpwned.com/api/v3';
const HIBP_USER_AGENT = 'unlinkd-privacy-tool';

export async function onRequestGet(context) {
  const email = context.params.email;
  const apiKey = context.request.headers.get('hibp-api-key');

  if (!apiKey) {
    return new Response('Missing hibp-api-key header.', {
      status: 400,
      headers: { 'x-hibp-proxy': '1' }
    });
  }

  const upstreamUrl = `${HIBP_API_BASE}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`;
  const upstream = await fetch(upstreamUrl, {
    headers: {
      'hibp-api-key': apiKey,
      'user-agent': HIBP_USER_AGENT
    }
  });

  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    'cache-control': 'no-store',
    // Marks responses as coming from this proxy so the client can tell a real
    // HIBP 404 ("no breaches") apart from a missing proxy route.
    'x-hibp-proxy': '1'
  });

  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) {
    headers.set('retry-after', retryAfter);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
