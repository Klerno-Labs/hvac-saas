import { describe, it, expect } from 'vitest'
import {
  canSendSms,
  defaultOrgSmsConfig,
  type OrgSmsConfig,
} from '@/lib/sms/send-gate'

const registered: OrgSmsConfig = {
  orgId: 'org_1',
  tenDlcRegistered: true,
  smsEnabled: true,
  messagingServiceSid: 'MG_test',
}

describe('canSendSms — 10DLC gate dominates', () => {
  it('returns not_10dlc_registered even when everything else is set', () => {
    const result = canSendSms({ ...registered, tenDlcRegistered: false }, false)
    expect(result).toEqual({ allowed: false, reason: 'not_10dlc_registered' })
  })

  it('returns not_10dlc_registered even when recipient is not opted out', () => {
    const result = canSendSms(
      { ...registered, tenDlcRegistered: false },
      false,
    )
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toBe('not_10dlc_registered')
  })
})

describe('canSendSms — secondary guards', () => {
  it('returns sms_disabled when registered but smsEnabled is false', () => {
    const result = canSendSms({ ...registered, smsEnabled: false }, false)
    expect(result).toEqual({ allowed: false, reason: 'sms_disabled' })
  })

  it('returns missing_messaging_service when registered+enabled but no sid', () => {
    const result = canSendSms(
      { ...registered, messagingServiceSid: undefined },
      false,
    )
    expect(result).toEqual({ allowed: false, reason: 'missing_messaging_service' })
  })

  it('returns recipient_opted_out when registered+enabled+sid but opted out', () => {
    const result = canSendSms(registered, true)
    expect(result).toEqual({ allowed: false, reason: 'recipient_opted_out' })
  })

  it('returns allowed:true for a fully-valid config with non-opted-out recipient', () => {
    const result = canSendSms(registered, false)
    expect(result).toEqual({ allowed: true })
  })
})

describe('defaultOrgSmsConfig', () => {
  it('is deny-by-default: tenDlcRegistered and smsEnabled are both false', () => {
    const cfg = defaultOrgSmsConfig('org_new')
    expect(cfg.tenDlcRegistered).toBe(false)
    expect(cfg.smsEnabled).toBe(false)
    expect(cfg.orgId).toBe('org_new')
  })

  it('produces a config that canSendSms rejects as not_10dlc_registered', () => {
    const result = canSendSms(defaultOrgSmsConfig('org_new'), false)
    expect(result).toEqual({ allowed: false, reason: 'not_10dlc_registered' })
  })
})
