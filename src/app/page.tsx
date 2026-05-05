import { cookies } from 'next/headers'
import { HomePage } from '@/components/HomePage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // Force dynamic rendering — prevents Next.js ISR caching
  void cookies()
  return <HomePage />
}
