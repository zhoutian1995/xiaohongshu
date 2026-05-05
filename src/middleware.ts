import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  const secret = process.env.API_SECRET_KEY

  // Local Mac mini mode defaults to no API secret. Do not set API_SECRET_KEY
  // unless the API is put behind an auth scheme that also supports EventSource.
  if (!secret) {
    return NextResponse.next()
  }

  if (!apiKey || apiKey !== secret) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Missing or invalid x-api-key header' },
      { status: 401 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
