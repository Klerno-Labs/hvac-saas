import { serviceTrade } from '@/lib/marketing/trades';
import { ImageResponse } from 'next/og';
const size = { width: 1200, height: 630 };
export const dynamic = 'force-static';
export function GET() { return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, width: '100%', height: '100%', background: '#fafaf8', color: '#090b0e' }}><div style={{ color: '#090b0e', fontSize: 34, display: 'flex' }}>FieldClose.</div><div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}><div style={{ fontSize: 68, fontWeight: 700 }}>Less paperwork. More paid work.</div><div style={{ fontSize: 30, color: '#565963' }}>{serviceTrade.description}</div></div><div style={{ fontSize: 22, color: '#090b0e' }}>fieldclose.app</div></div>, size); }
