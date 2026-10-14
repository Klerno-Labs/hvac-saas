import { describe, expect, it } from 'vitest'
import { parseCustomerCsv, prepareCustomerImport, partitionCustomerImport } from '@/lib/customer-import'
const mapping = { firstName: 'Name', phone: 'Phone', email: 'Email' }
describe('customer self-service import', () => {
  it('accepts a BOM and quoted commas/newlines without losing columns', () => {
    const parsed = parseCustomerCsv('\uFEFFName,Phone,Email\n"Alex, Jr",5551234,alex@example.test\n"Two\nLines",5559999,')
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0][0]).toBe('Alex, Jr')
    expect(parsed.rows[1][0]).toBe('Two\nLines')
  })
  it.each(['Name,Name\na,b', 'Name,,Phone\na,b,c', 'Name,Phone\na,b,extra', 'Name,Phone\na', 'Name,Phone\n"unfinished,b', 'Name,Phone\n'])('rejects ambiguous/truncated CSV %s', csv => expect(() => parseCustomerCsv(csv)).toThrow())
  it('bounds rows and UTF-8 byte length before processing', () => {
    expect(() => parseCustomerCsv('Name,Phone\n' + 'A,555\n'.repeat(501))).toThrow('500')
    expect(() => parseCustomerCsv('Name,Phone\n' + 'é'.repeat(150_001))).toThrow('300 KB')
  })
  it('requires distinct mapped required columns', () => {
    const csv = 'Name,Phone,Email\nAlex,5551234,alex@example.test'
    expect(() => prepareCustomerImport({ csv, mapping: { firstName: 'Name' } })).toThrow('phone')
    expect(() => prepareCustomerImport({ csv, mapping: { firstName: 'Name', phone: 'Name' } })).toThrow('only one')
    expect(() => prepareCustomerImport({ csv, mapping: { ...mapping, phone: 'Missing' } })).toThrow('missing')
  })
  it('validates every row, normalizes email, and skips existing/in-file emails without overwriting', () => {
    const prepared = prepareCustomerImport({ csv: 'Name,Phone,Email\nAlex,5551234, OLD@EXAMPLE.TEST \nBob,5551235,new@example.test\nCopy,5551236,new@example.test\nInvalid,,bad\nNo Email,5551237,', mapping })
    const result = partitionCustomerImport(prepared, [{ email: 'old@example.test' }])
    expect(result.report).toMatchObject({ total: 5, created: 2, duplicates: 2, invalid: 1 })
    expect(result.creates.map(row => row.data.firstName)).toEqual(['Bob', 'No Email'])
    expect(result.report.issues.map(issue => issue.row).sort()).toEqual([2, 4, 5])
  })
})
