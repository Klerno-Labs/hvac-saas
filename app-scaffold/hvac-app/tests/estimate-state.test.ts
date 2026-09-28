import {beforeEach, describe, expect, it, vi} from 'vitest'
vi.mock('@/lib/auth',()=>({auth:vi.fn()}))
vi.mock('@/lib/db',()=>({db:{organizationMember:{findFirst:vi.fn()},estimate:{findFirst:vi.fn(),updateMany:vi.fn()}}}))
vi.mock('@/lib/events',()=>({trackEvent:vi.fn()}))
vi.mock('@/lib/audit',()=>({logAudit:vi.fn()}))
vi.mock('@/lib/portal',()=>({getOrCreatePortalUrl:vi.fn()}))
vi.mock('@/lib/email',()=>({sendEstimateEmail:vi.fn()}))
import {auth} from '@/lib/auth'
import {db} from '@/lib/db'
import {updateEstimateStatus} from '@/app/estimates/[estimateId]/actions'
const form=(status:string)=>{const f=new FormData();f.set('status',status);return f}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(auth).mockResolvedValue({user:{id:'user1'}} as never)
 vi.mocked(db.organizationMember.findFirst).mockResolvedValue({organizationId:'org1',role:'owner', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null },} as never)
 vi.mocked(db.estimate.findFirst).mockResolvedValue({id:'estimate1',status:'sent',totalCents:10000,updatedAt:new Date(),job:{customer:{}}} as never)
 vi.mocked(db.estimate.updateMany).mockResolvedValue({count:1})
})
describe('estimate state protection',()=>{
 it.each(['sent','accepted'])('keeps unpriced estimates from becoming %s',async status=>{vi.mocked(db.estimate.findFirst).mockResolvedValue({id:'estimate1',status:'draft',totalCents:0,job:{customer:{}}} as never);const result=await updateEstimateStatus('estimate1',form(status));expect(result).toMatchObject({success:false,error:expect.stringContaining('pricing')});expect(db.estimate.updateMany).not.toHaveBeenCalled()})

 it('denies technician status changes',async()=>{vi.mocked(db.organizationMember.findFirst).mockResolvedValue({organizationId:'org1',role:'technician', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null },} as never);expect((await updateEstimateStatus('estimate1',form('accepted'))).success).toBe(false);expect(db.estimate.updateMany).not.toHaveBeenCalled()})
 it.each(['accepted','declined'])('does not reopen finalized %s estimates',async status=>{vi.mocked(db.estimate.findFirst).mockResolvedValue({status} as never);expect((await updateEstimateStatus('estimate1',form('draft'))).success).toBe(false);expect(db.estimate.updateMany).not.toHaveBeenCalled()})
 it('prevents returning sent documents to an editable draft',async()=>{expect((await updateEstimateStatus('estimate1',form('draft'))).success).toBe(false);expect(db.estimate.updateMany).not.toHaveBeenCalled()})
 it('detects a concurrent customer approval',async()=>{vi.mocked(db.estimate.updateMany).mockResolvedValue({count:0});expect((await updateEstimateStatus('estimate1',form('declined'))).success).toBe(false)})
 it('allows an authorized decision on a sent estimate',async()=>{expect((await updateEstimateStatus('estimate1',form('accepted'))).success).toBe(true);expect(db.estimate.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'org1',status:'sent'})}))})
})
