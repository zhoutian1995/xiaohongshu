import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Import after env setup
const { middleware } = await import('../middleware')

describe('API Key Middleware', () => {
  const ORIGINAL_ENV = process.env.API_SECRET_KEY

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.API_SECRET_KEY = ORIGINAL_ENV
    } else {
      delete process.env.API_SECRET_KEY
    }
  })

  it('passes through when correct x-api-key is provided', async () => {
    process.env.API_SECRET_KEY = 'test-secret'
    const req = new NextRequest('http://localhost:3000/api/jobs', {
      headers: { 'x-api-key': 'test-secret' },
    })
    const res = await middleware(req)
    expect(res.status).not.toBe(401)
  })

  it('returns 401 when x-api-key is wrong', async () => {
    process.env.API_SECRET_KEY = 'test-secret'
    const req = new NextRequest('http://localhost:3000/api/jobs', {
      headers: { 'x-api-key': 'wrong-key' },
    })
    const res = await middleware(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when x-api-key is missing', async () => {
    process.env.API_SECRET_KEY = 'test-secret'
    const req = new NextRequest('http://localhost:3000/api/jobs')
    const res = await middleware(req)
    expect(res.status).toBe(401)
  })

  it('passes through when API_SECRET_KEY is not configured', async () => {
    delete process.env.API_SECRET_KEY
    const req = new NextRequest('http://localhost:3000/api/jobs')
    const res = await middleware(req)
    expect(res.status).not.toBe(401)
  })
})
