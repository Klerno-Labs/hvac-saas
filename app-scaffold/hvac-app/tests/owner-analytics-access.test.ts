import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({auth:vi.fn(),member:vi.fn(),active:vi.fn(),analytics:vi.fn()}))
vi.mock('@/lib/auth',()=>({auth:mocks.auth}))
vi.mock('@/lib/db',()=>({db:{organizationMember:{findFirst:mocks.member}}}))
vi.mock('@/lib/billing',()=>({isSubscriptionActive:mocks.active}))
vi.mock('@/lib/owner-analytics',()=>({getOwnerAnalytics:mocks.analytics}))
const {GET}=await import('@/app/api/analytics/owner/route')
const request=()=>new Request('http://localhost/api/analytics/owner?period=ytd&organizationId=foreign')
beforeEach(()=>{vi.resetAllMocks();mocks.auth.mockResolvedValue({user:{id:'actor'}});mocks.member.mockResolvedValue({role:'owner',organizationId:'actual-org',organization:{timezone:'UTC'}});mocks.active.mockReturnValue(true);mocks.analytics.mockResolvedValue({revenue:{collectedCents:123}})})
describe('financial analytics authorization',()=>{
  it.each(['technician','dispatcher','csr','unknown'])('denies %s before querying financial data',async role=>{
    mocks.member.mockResolvedValue({role,organizationId:'actual-org',organization:{}})
    const r=await GET(request());expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(mocks.analytics).not.toHaveBeenCalled()
  })
  it.each(['owner','office_admin','member'])('allows the existing pricing capability for %s and ignores supplied tenant',async role=>{
    mocks.member.mockResolvedValue({role,organizationId:'actual-org',organization:{timezone:'UTC'}})
    const r=await GET(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(mocks.analytics).toHaveBeenCalledWith('actual-org',expect.any(Object))
  })
  it('rejects anonymous requests before database access',async()=>{mocks.auth.mockResolvedValue(null);expect((await GET(request())).status).toBe(401);expect(mocks.member).not.toHaveBeenCalled();expect(mocks.analytics).not.toHaveBeenCalled()})
  it('rejects inactive subscriptions before financial queries',async()=>{mocks.active.mockReturnValue(false);expect((await GET(request())).status).toBe(401);expect(mocks.analytics).not.toHaveBeenCalled()})
})
