import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth',()=>({auth:vi.fn()}))
vi.mock('@/lib/db',()=>({db:{organizationMember:{findFirst:vi.fn()},invoice:{findFirst:vi.fn(),updateMany:vi.fn()},organization:{findUnique:vi.fn()}}}))
vi.mock('@/lib/events',()=>({trackEvent:vi.fn()}))
vi.mock('@/lib/audit',()=>({logAudit:vi.fn()}))
vi.mock('@/lib/portal',()=>({getOrCreatePortalUrl:vi.fn()}))
vi.mock('@/lib/email',()=>({sendInvoiceEmail:vi.fn()}))
vi.mock('@/lib/stripe',()=>({getStripe:vi.fn()}))
import {auth} from '@/lib/auth'
import {db} from '@/lib/db'
import {updateInvoiceStatus} from '@/app/invoices/[invoiceId]/actions'
import {getStripe} from '@/lib/stripe'
const form = (status:string) => {const data=new FormData();data.set('status',status);return data}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(auth).mockResolvedValue({user:{id:'user1'}} as never)
 vi.mocked(db.organizationMember.findFirst).mockResolvedValue({organizationId:'org1',role:'owner', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null },} as never)
 vi.mocked(db.invoice.findFirst).mockResolvedValue({id:'invoice1',status:'sent',organizationId:'org1',customer:{},stripeCheckoutSessionId:null,updatedAt:new Date()} as never)
 vi.mocked(db.invoice.updateMany).mockResolvedValue({count:1})
})
describe('invoice state controls',()=>{
 it('cannot forge a paid state',async()=>{const res=await updateInvoiceStatus('invoice1',form('paid'));expect(res.success).toBe(false);expect(db.invoice.updateMany).not.toHaveBeenCalled()})
 it('denies technicians pricing controls',async()=>{vi.mocked(db.organizationMember.findFirst).mockResolvedValue({organizationId:'org1',role:'technician', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null },} as never);expect((await updateInvoiceStatus('invoice1',form('void'))).success).toBe(false);expect(db.invoice.findFirst).not.toHaveBeenCalled()})
 it.each(['paid','void'])('does not reopen %s invoices',async status=>{vi.mocked(db.invoice.findFirst).mockResolvedValue({status} as never);expect((await updateInvoiceStatus('invoice1',form('sent'))).success).toBe(false);expect(db.invoice.updateMany).not.toHaveBeenCalled()})
 it('detects concurrent changes before reporting success',async()=>{vi.mocked(db.invoice.updateMany).mockResolvedValue({count:0});expect((await updateInvoiceStatus('invoice1',form('overdue'))).success).toBe(false)})
 it('does not void while checkout has a payment in progress',async()=>{vi.mocked(db.invoice.findFirst).mockResolvedValue({status:'sent',stripeCheckoutSessionId:'cs1'} as never);vi.mocked(db.organization.findUnique).mockResolvedValue({stripeConnectedAccountId:'acct1'} as never);vi.mocked(getStripe).mockReturnValue({checkout:{sessions:{retrieve:vi.fn(async()=>({status:'complete'}))}}} as never);expect((await updateInvoiceStatus('invoice1',form('void'))).success).toBe(false);expect(db.invoice.updateMany).not.toHaveBeenCalled()})
})
