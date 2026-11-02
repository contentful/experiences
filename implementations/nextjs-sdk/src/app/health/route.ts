import { NextResponse } from 'next/server';

export function GET() {
  return new NextResponse('ok', { headers: { 'Cache-Control': 'no-store' } });
}
