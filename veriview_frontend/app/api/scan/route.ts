import { NextRequest, NextResponse } from 'next/server'

// Rate limit store (in-memory, use Redis/Upstash in production)
const rateLimitMap = new Map<string, { count: number; reset: number }>()

const RATE_LIMIT = 5         // requests per window
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

function getRateLimitKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for') ?? 'unknown'
}

function checkRateLimit(key: string): { ok: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.reset) {
    rateLimitMap.set(key, { count: 1, reset: now + WINDOW_MS })
    return { ok: true, remaining: RATE_LIMIT - 1 }
  }

  if (entry.count >= RATE_LIMIT) {
    return { ok: false, remaining: 0 }
  }

  entry.count++
  return { ok: true, remaining: RATE_LIMIT - entry.count }
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getRateLimitKey(req)
  const { ok, remaining } = checkRateLimit(ip)

  if (!ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Get an API key for unlimited scans.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, html, axes = ['all'] } = body as {
    url?: string
    html?: string
    axes?: string[]
  }

  if (!url && !html) {
    return NextResponse.json(
      { error: 'Either url or html is required' },
      { status: 400 }
    )
  }

  // Validate URL if provided
  if (url) {
    try {
      new URL(url as string)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
  }

  // Forward to local VeriView gateway (configurable)
  const backendUrl = process.env.VERIVIEW_BACKEND_URL ?? 'http://localhost:8082'
  const apiKey = process.env.VERIVIEW_API_KEY ?? 'key1'

  try {
    const upstream = await fetch(`${backendUrl}/api/v1/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Forwarded-For': ip,
      },
      body: JSON.stringify({ url, html, axes }),
    })

    // Stream SSE back to client
    if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-RateLimit-Limit': String(RATE_LIMIT),
          'X-RateLimit-Remaining': String(remaining),
        },
      })
    }

    // JSON response
    const data = await upstream.json()
    return NextResponse.json(data, {
      status: upstream.status,
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT),
        'X-RateLimit-Remaining': String(remaining),
      },
    })
  } catch (err) {
    console.error('[/api/scan] upstream error:', err)
    return NextResponse.json(
      { error: 'Failed to reach VeriView backend' },
      { status: 502 }
    )
  }
}
