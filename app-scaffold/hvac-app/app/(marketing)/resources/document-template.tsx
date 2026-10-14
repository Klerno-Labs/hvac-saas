'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { templateTotals, validTemplateRate, type TemplateLine } from '@/lib/document-template'
import styles from './template.module.css'

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const initialLines: TemplateLine[] = [{ description: '', quantity: 1, rate: 0 }]

export function DocumentTemplate({ kind }: { kind: 'estimate' | 'invoice' }) {
  const label = kind === 'estimate' ? 'Estimate' : 'Invoice'
  const [fields, setFields] = useState({ business: '', contact: '', customer: '', address: '', reference: '', issued: '', due: '', equipment: '', notes: '' })
  const [lines, setLines] = useState<TemplateLine[]>(initialLines)
  const [taxRate, setTaxRate] = useState(0)
  const [sample, setSample] = useState(false)
  const [printReady, setPrintReady] = useState(false)
  useEffect(() => { setPrintReady(true) }, [])
  const totals = templateTotals(lines, taxRate)
  const incomplete = !fields.business.trim() || !fields.customer.trim() || !fields.reference.trim() || !fields.issued || lines.some(line => !line.description.trim())

  function field(name: keyof typeof fields, title: string, type = 'text', placeholder = '') {
    return <label className={styles.field}><span>{title}</span><input type={type} autoComplete="off" value={fields[name]} placeholder={placeholder} maxLength={300} onChange={event => setFields(current => ({ ...current, [name]: event.target.value }))} /><span className={styles.printValue}>{fields[name] || '____________________'}</span></label>
  }
  function updateLine(index: number, change: Partial<TemplateLine>) { setLines(current => current.map((line, i) => i === index ? { ...line, ...change } : line)) }
  function loadSample() {
    setFields({ business: 'Example HVAC Company — SAMPLE', contact: 'Your phone and email', customer: 'Alex Sample', address: 'Example service address', reference: kind === 'estimate' ? 'EST-1001' : 'INV-1001', issued: '2026-10-04', due: '2026-10-18', equipment: 'Residential split system — model and serial here', notes: kind === 'estimate' ? 'Example scope: diagnose a cooling complaint and replace one approved part. Additional repairs require written approval. Confirm availability before scheduling.' : 'Example work: completed diagnosis and approved part replacement. System tested after repair. Add your payment instructions and applicable warranty terms.' })
    setLines([{ description: 'Diagnostic visit', quantity: 1, rate: 95 }, { description: 'Example replacement part', quantity: 1, rate: 85 }, { description: 'Installation labor (hours)', quantity: 1.5, rate: 90 }])
    setTaxRate(0); setSample(true)
  }
  function reset() { setFields({ business: '', contact: '', customer: '', address: '', reference: '', issued: '', due: '', equipment: '', notes: '' }); setLines(initialLines); setTaxRate(0); setSample(false) }

  const templateDocument = <div className={styles.document}>
      <div className={styles.documentHeading}><h3>HVAC {label}</h3>{sample && <span>EXAMPLE — REPLACE SAMPLE DETAILS</span>}<span>USD</span></div>
      {!totals && <p className={styles.error}>INVALID NUMERIC VALUES — Correct quantities, unit prices and tax before using this document.</p>}
      <div className={styles.fields}>
        {field('business', 'Business name', 'text', 'Your HVAC business')}{field('contact', 'Business phone / email')}
        {field('customer', 'Customer name')}{field('address', 'Service address')}
        {field('reference', `${label} number`)}{field('issued', kind === 'estimate' ? 'Estimate date' : 'Invoice date', 'date')}
        {field('due', kind === 'estimate' ? 'Valid through' : 'Payment due', 'date')}{field('equipment', 'Equipment / work reference')}
      </div>
      <div className={styles.lines}>{lines.map((line, index) => {
        const validQuantity = Number.isFinite(line.quantity) && line.quantity >= 0 && line.quantity <= 10000
        const validRate = validTemplateRate(line.rate)
        return <fieldset className={styles.line} key={index}><legend>Item {index + 1}</legend><label className={styles.description}><span>Description</span><input autoComplete="off" maxLength={300} value={line.description} onChange={event => updateLine(index, { description: event.target.value })} placeholder="Service, labor or material" /><span className={styles.printValue}>{line.description || '____________________'}</span></label><label><span>Quantity</span><input type="number" min="0" max="10000" step="0.01" inputMode="decimal" aria-invalid={!validQuantity} value={Number.isNaN(line.quantity) ? '' : line.quantity} onChange={event => updateLine(index, { quantity: event.target.valueAsNumber })} /><span className={styles.printValue}>{validQuantity ? line.quantity : 'INVALID'}</span></label><label><span>Unit price ($)</span><input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" aria-invalid={!validRate} value={Number.isNaN(line.rate) ? '' : line.rate} onChange={event => updateLine(index, { rate: event.target.valueAsNumber })} /><span className={styles.printValue}>{validRate ? dollars(Math.round(line.rate * 100)) : 'INVALID'}</span></label><div className={styles.amount}><span>Amount</span><strong>{totals ? dollars(totals.amounts[index]) : '—'}</strong></div><button className={styles.remove} type="button" disabled={lines.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove</button></fieldset>
      })}</div>
      <button className={styles.add} type="button" disabled={lines.length >= 30} onClick={() => setLines(current => [...current, { description: '', quantity: 1, rate: 0 }])}>+ Add line item</button>
      <div className={styles.bottom}><label className={styles.notes}><span>{kind === 'estimate' ? 'Scope, exclusions, schedule and approval terms' : 'Work completed, payment instructions and warranty notes'}</span><textarea autoComplete="off" rows={6} maxLength={4000} value={fields.notes} onChange={event => setFields(current => ({ ...current, notes: event.target.value }))} /><span className={styles.printValue}>{fields.notes || 'Add your job-specific terms and notes.'}</span></label><div className={styles.totals}><label className={styles.field}><span>Tax on all line items (%)</span><input type="number" min="0" max="100" step="0.01" inputMode="decimal" aria-invalid={!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100} value={Number.isNaN(taxRate) ? '' : taxRate} onChange={event => setTaxRate(event.target.valueAsNumber)} /><span className={styles.printValue}>{Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100 ? `${taxRate}%` : 'INVALID'}</span></label><dl aria-live="polite"><div><dt>Subtotal</dt><dd>{totals ? dollars(totals.subtotal) : '—'}</dd></div><div><dt>Tax</dt><dd>{totals ? dollars(totals.tax) : '—'}</dd></div><div className={styles.grandTotal}><dt>Total</dt><dd>{totals ? dollars(totals.total) : '—'}</dd></div></dl></div></div>
      {kind === 'estimate' && <p className={styles.signature}>Approved by: ____________________ &nbsp; Date: __________<br /><small>Record approval before starting work. This printable template does not capture an electronic signature.</small></p>}
    </div>

  return <section className={styles.tool} aria-labelledby="template-title">
    <div className={styles.toolbar}><div><p className="eyebrow">No signup required</p><h2 id="template-title">Make it yours.</h2><p>Fill in the fields, then print or choose “Save as PDF” in your browser.</p></div><div className={styles.actions}><button type="button" onClick={loadSample}>Load example</button><button type="button" onClick={reset}>Clear fields</button></div></div>
    <p className={styles.privacy}>Your entries stay in this page’s memory. They are not submitted to FieldClose or saved when you leave or reload. Review the PDF before sharing it.</p>
    {templateDocument}
    {printReady && createPortal(<div className={`fieldclose-marketing ${styles.printRoot}`}>{templateDocument}</div>, document.body)}
    {!totals && <p role="alert" className={styles.error}>Enter quantities from 0 to 10,000, unit prices from $0 to $1,000,000 with at most two decimal places, and a tax rate from 0% to 100%.</p>}
    <div className={styles.printActions}><button type="button" className="button" disabled={!totals || !printReady} onClick={() => window.print()}>Print / save PDF</button><p>{incomplete ? 'Some document fields are blank. You can print a blank template or fill them before sharing.' : 'Check customer details, scope, totals and terms before sharing.'} {sample && 'Sample pricing is illustrative, not a recommended service rate.'}</p></div>
    <p className={styles.privacy}>This simple template applies one tax rate to the entire subtotal. If your job needs mixed taxable items, discounts, deposits, multiple tax rates or another currency, use a document that supports those requirements.</p>
  </section>
}
