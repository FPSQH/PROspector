import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/manager/dashboard', req.url))
  res.cookies.delete('delegation_commercial_id')
  res.cookies.delete('delegation_manager_id')
  return res
}
