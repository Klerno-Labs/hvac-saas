'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { parseCsv } from '@/lib/csv-import/parse'
import { suggestMapping, applyMapping } from '@/lib/csv-import/mapping'
import { ENTITY_SPECS, type ImportEntityType } from '@/lib/csv-import/specs'
import { previewImport, commitImport, type RowReport } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Step = 'entity' | 'map' | 'preview' | 'done'

type PreviewData = {
  total: number
  valid: number
  duplicates: number
  invalid: number
  preview: RowReport[]
}

type CommitData = {
  created: number
  skippedDuplicates: number
  skippedInvalid: number
}

const ENTITY_DESCRIPTIONS: Record<ImportEntityType, string> = {
  customers: 'Names, phone numbers, email addresses, and addresses',
  equipment: 'HVAC systems linked to existing customers by email or phone',
  pricebook: 'Parts, labor codes, and services with pricing',
}

const POST_IMPORT_LINKS: Record<ImportEntityType, { href: string; label: string }> = {
  customers: { href: '/customers', label: 'View customers' },
  pricebook: { href: '/inventory', label: 'View price book' },
  equipment: { href: '/customers', label: 'View customers' },
}

export function ImportClient() {
  const [step, setStep] = useState<Step>('entity')
  const [kind, setKind] = useState<ImportEntityType | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [commitData, setCommitData] = useState<CommitData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function requiredUnmapped(): string[] {
    if (!kind) return []
    return ENTITY_SPECS[kind].fields
      .filter((f) => f.required && !mapping[f.key])
      .map((f) => f.label)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const text = await file.text()
    const parsed = parseCsv(text)
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    if (kind && parsed.headers.length > 0) {
      setMapping(suggestMapping(parsed.headers, ENTITY_SPECS[kind]))
    }
  }

  async function handlePreview() {
    if (!kind) return
    setError(null)
    setLoading(true)
    try {
      const spec = ENTITY_SPECS[kind]
      const mappedRows = applyMapping(rows, headers, mapping, spec)
      const result = await previewImport({ kind, rows: mappedRows })
      if (!result.success) {
        setError(result.error)
      } else {
        setPreviewData(result)
        setStep('preview')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCommit() {
    if (!kind || !previewData) return
    setError(null)
    setLoading(true)
    try {
      const spec = ENTITY_SPECS[kind]
      const mappedRows = applyMapping(rows, headers, mapping, spec)
      const result = await commitImport({ kind, rows: mappedRows })
      if (!result.success) {
        setError(result.error)
      } else {
        setCommitData(result)
        setStep('done')
      }
    } finally {
      setLoading(false)
    }
  }

  function resetToMap() {
    setStep('map')
    setPreviewData(null)
    setError(null)
  }

  function resetAll() {
    setStep('entity')
    setKind(null)
    setHeaders([])
    setRows([])
    setMapping({})
    setPreviewData(null)
    setCommitData(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Step: entity ──────────────────────────────────────────────────────────

  if (step === 'entity') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What would you like to import?</CardTitle>
          <CardDescription>Choose the type of records to bring in from a CSV export.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(ENTITY_SPECS) as ImportEntityType[]).map((key) => {
            const spec = ENTITY_SPECS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors',
                  kind === key
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-border hover:border-muted-foreground/50',
                )}
              >
                <div className="font-medium">{spec.label}</div>
                <div className="text-muted-foreground text-xs mt-0.5">{ENTITY_DESCRIPTIONS[key]}</div>
              </button>
            )
          })}
          <Separator className="my-2" />
          <Button type="button" disabled={!kind} onClick={() => kind && setStep('map')}>
            Next
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Step: map ─────────────────────────────────────────────────────────────

  if (step === 'map' && kind) {
    const spec = ENTITY_SPECS[kind]
    const missing = requiredUnmapped()
    const canPreview = rows.length > 0 && missing.length === 0

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV file</CardTitle>
            <CardDescription>
              Headers must be in the first row. The file is parsed in your browser — raw data is never
              uploaded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="csvFile">CSV file</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFile}
              />
            </div>
            {headers.length > 0 && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Headers detected but no data rows found.
              </p>
            )}
            {rows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {rows.length} data row{rows.length !== 1 ? 's' : ''} detected.
              </p>
            )}
          </CardContent>
        </Card>

        {headers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Map columns</CardTitle>
              <CardDescription>
                Match each field to a column from your CSV. Required fields are marked with{' '}
                <span className="text-destructive">*</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Field</TableHead>
                    <TableHead>CSV column</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spec.fields.map((field) => (
                    <TableRow key={field.key}>
                      <TableCell>
                        <span>
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-0.5">*</span>
                          )}
                        </span>
                        {field.help && (
                          <p className="text-xs text-muted-foreground mt-0.5">{field.help}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <select
                          value={mapping[field.key] || ''}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— not mapped —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>
        )}

        {rows.length > 0 && missing.length > 0 && (
          <p className="text-sm text-destructive">
            Map required field{missing.length !== 1 ? 's' : ''} before previewing:{' '}
            {missing.join(', ')}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="button" onClick={handlePreview} disabled={loading || !canPreview}>
            {loading ? 'Checking…' : 'Preview import'}
          </Button>
          <Button type="button" variant="ghost" onClick={resetAll}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  // ── Step: preview ─────────────────────────────────────────────────────────

  if (step === 'preview' && kind && previewData) {
    const spec = ENTITY_SPECS[kind]
    const displayFields = spec.fields.filter((f) => mapping[f.key]).slice(0, 4)

    function statusBadge(status: RowReport['status']) {
      const base = 'inline-block text-xs px-1.5 py-0.5 rounded font-medium'
      if (status === 'valid') return <span className={cn(base, 'bg-green-100 text-green-800')}>valid</span>
      if (status === 'duplicate') return <span className={cn(base, 'bg-yellow-100 text-yellow-800')}>duplicate</span>
      return <span className={cn(base, 'bg-red-100 text-red-800')}>invalid</span>
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Import preview — {spec.label}</CardTitle>
            <CardDescription>Review before committing. Duplicates and invalid rows are skipped.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold">{previewData.total}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Will import</p>
                <p className="text-2xl font-semibold text-green-700">{previewData.valid}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Duplicates</p>
                <p className="text-2xl font-semibold text-yellow-700">{previewData.duplicates}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Invalid</p>
                <p className="text-2xl font-semibold text-red-700">{previewData.invalid}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {previewData.preview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">First {previewData.preview.length} rows</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Status</TableHead>
                    {displayFields.map((f) => (
                      <TableHead key={f.key}>{f.label}</TableHead>
                    ))}
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.preview.map((row) => (
                    <TableRow key={row.index}>
                      <TableCell className="text-muted-foreground">{row.index + 1}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      {displayFields.map((f) => (
                        <TableCell key={f.key} className="max-w-[140px] truncate">
                          {row.data[f.key] || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        {row.reason || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">{error}</div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={handleCommit}
            disabled={loading || previewData.valid === 0}
          >
            {loading ? 'Importing…' : `Import ${previewData.valid} record${previewData.valid !== 1 ? 's' : ''}`}
          </Button>
          <Button type="button" variant="ghost" onClick={resetToMap}>
            Back
          </Button>
        </div>

        {previewData.valid === 0 && (
          <p className="text-sm text-muted-foreground">
            No valid rows to import. Fix the issues above and re-upload.
          </p>
        )}
      </div>
    )
  }

  // ── Step: done ────────────────────────────────────────────────────────────

  if (step === 'done' && kind && commitData) {
    const link = POST_IMPORT_LINKS[kind]
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import complete</CardTitle>
          <CardDescription>{ENTITY_SPECS[kind].label} have been imported.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="text-2xl font-semibold text-green-700">{commitData.created}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Skipped (duplicate)</p>
              <p className="text-2xl font-semibold text-yellow-700">{commitData.skippedDuplicates}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Skipped (invalid)</p>
              <p className="text-2xl font-semibold text-red-700">{commitData.skippedInvalid}</p>
            </div>
          </div>
          <Separator />
          <div className="flex gap-3">
            <Link href={link.href} className="text-sm underline text-primary">
              {link.label}
            </Link>
            <button type="button" onClick={resetAll} className="text-sm text-muted-foreground hover:text-foreground">
              Import more
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
