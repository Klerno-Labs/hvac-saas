'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
import { parseCsv } from '@/lib/csv-import/parse'
import { suggestMapping, applyMapping } from '@/lib/csv-import/mapping'
import { ENTITY_SPECS, type ImportEntityType, type Mapping } from '@/lib/csv-import/specs'
import { previewImport, commitImport, type PreviewResult, type CommitResult } from './actions'

type Step = 'kind' | 'map' | 'preview' | 'done'

const ENTITY_OPTIONS: { value: ImportEntityType; label: string }[] = [
  { value: 'customers', label: 'Customers' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'pricebook', label: 'Price book items' },
]

const DONE_LINKS: Record<ImportEntityType, string> = {
  customers: '/customers',
  pricebook: '/inventory',
  equipment: '/customers',
}

export function ImportClient() {
  const [step, setStep] = useState<Step>('kind')
  const [kind, setKind] = useState<ImportEntityType>('customers')
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Extract<PreviewResult, { success: true }> | null>(
    null,
  )
  const [commitData, setCommitData] = useState<Extract<CommitResult, { success: true }> | null>(
    null,
  )

  const spec = ENTITY_SPECS[kind]
  const unmappedRequired = spec.fields.filter((f) => f.required && !mapping[f.key])
  const mappedFields = spec.fields.filter((f) => mapping[f.key])

  function handleKindChange(newKind: ImportEntityType) {
    setKind(newKind)
    setParsed(null)
    setMapping({})
    setError(null)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const text = await file.text()
    const result = parseCsv(text)
    const suggested = suggestMapping(result.headers, ENTITY_SPECS[kind])
    setParsed(result)
    setMapping(suggested)
  }

  async function handlePreview() {
    if (!parsed || parsed.rows.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const mappedRows = applyMapping(parsed.rows, parsed.headers, mapping, spec)
      const result = await previewImport({ kind, rows: mappedRows, mapping })
      if (!result.success) {
        setError(result.error)
      } else {
        setPreviewData(result)
        setStep('preview')
      }
    } catch {
      setError('Failed to preview import. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCommit() {
    if (!parsed || !previewData || previewData.valid === 0) return
    setLoading(true)
    setError(null)
    try {
      const mappedRows = applyMapping(parsed.rows, parsed.headers, mapping, spec)
      const result = await commitImport({ kind, rows: mappedRows, mapping })
      if (!result.success) {
        setError(result.error)
      } else {
        setCommitData(result)
        setStep('done')
      }
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'kind') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What would you like to import?</CardTitle>
          <CardDescription>
            Upload a CSV file to bulk-import records into your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entity-kind">Record type</Label>
            <select
              id="entity-kind"
              value={kind}
              onChange={(e) => handleKindChange(e.target.value as ImportEntityType)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {ENTITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => setStep('map')}>Continue</Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'map') {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Upload your CSV</CardTitle>
            <CardDescription>
              Importing:{' '}
              <strong>{spec.label}</strong> —{' '}
              <button
                type="button"
                onClick={() => setStep('kind')}
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                change
              </button>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:text-sm file:bg-transparent hover:file:bg-muted cursor-pointer"
              />
            </div>

            {parsed && parsed.rows.length === 0 && (
              <p className="text-sm text-amber-600">
                No data rows found in this file. Make sure the CSV has a header row and at least one
                data row.
              </p>
            )}
          </CardContent>
        </Card>

        {parsed && parsed.rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Map columns</CardTitle>
              <CardDescription>
                Match each field to a column from your CSV. Required fields are marked with{' '}
                <span className="text-destructive">*</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>CSV column</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spec.fields.map((field) => (
                      <TableRow key={field.key}>
                        <TableCell className="font-medium">
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-1" aria-label="required">
                              *
                            </span>
                          )}
                          {field.help && (
                            <span className="block text-xs text-muted-foreground font-normal">
                              {field.help}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <select
                            value={mapping[field.key] ?? ''}
                            onChange={(e) =>
                              setMapping({ ...mapping, [field.key]: e.target.value })
                            }
                            className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring"
                          >
                            <option value="">— skip —</option>
                            {parsed.headers.map((h) => (
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
              </div>

              {unmappedRequired.length > 0 && (
                <p className="text-sm text-destructive">
                  Map required fields before previewing:{' '}
                  {unmappedRequired.map((f) => f.label).join(', ')}
                </p>
              )}

              <Separator />

              <div className="flex gap-3">
                <Button
                  onClick={handlePreview}
                  disabled={loading || unmappedRequired.length > 0}
                >
                  {loading ? 'Checking…' : `Preview import (${parsed.rows.length} rows)`}
                </Button>
                <Button variant="ghost" onClick={() => setStep('kind')}>
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  if (step === 'preview' && previewData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Import preview</CardTitle>
            <CardDescription>
              Review the results before committing. Only valid records will be imported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{previewData.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total rows</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{previewData.valid}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Will import</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{previewData.duplicates}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Duplicates skipped</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-destructive">{previewData.invalid}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Invalid skipped</div>
              </div>
            </div>

            {previewData.preview.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Showing first {previewData.preview.length} of {previewData.total} rows:
                </p>
                <div className="overflow-auto max-h-72 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        {mappedFields.slice(0, 4).map((f) => (
                          <TableHead key={f.key}>{f.label}</TableHead>
                        ))}
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.preview.map((row) => (
                        <TableRow key={row.index}>
                          <TableCell className="text-muted-foreground">{row.index + 1}</TableCell>
                          {mappedFields.slice(0, 4).map((f) => (
                            <TableCell key={f.key}>{row.raw[f.key] ?? ''}</TableCell>
                          ))}
                          <TableCell>
                            <span
                              className={
                                row.status === 'valid'
                                  ? 'text-green-600'
                                  : row.status === 'duplicate'
                                    ? 'text-amber-600'
                                    : 'text-destructive'
                              }
                            >
                              {row.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                            {row.reason ?? ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <Separator />

            <div className="flex gap-3">
              <Button
                onClick={handleCommit}
                disabled={loading || previewData.valid === 0}
              >
                {loading
                  ? 'Importing…'
                  : previewData.valid === 0
                    ? 'Nothing to import'
                    : `Import ${previewData.valid} ${spec.singularLabel}${previewData.valid === 1 ? '' : 's'}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('map')
                  setPreviewData(null)
                  setError(null)
                }}
              >
                Adjust mapping
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'done' && commitData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{commitData.created}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Created</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{commitData.skippedDuplicates}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Duplicates skipped</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">
                {commitData.skippedInvalid}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Invalid skipped</div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link href={DONE_LINKS[kind]} className="inline-flex">
              <Button>View {spec.label}</Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                setStep('kind')
                setParsed(null)
                setMapping({})
                setPreviewData(null)
                setCommitData(null)
                setError(null)
              }}
            >
              Import more
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
