import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  const secret = process.env.API_SECRET_KEY

  // If no secret configured, skip auth (allows local dev without env var)
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
