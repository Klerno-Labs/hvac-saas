'use client'

import { useState } from 'react'
import { importPriceBookItems } from '../actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

type ImportResult = {
  success: true
  created: number
  updated: number
  skipped: number
  errors: { line: number; message: string }[]
} | {
  success: false
  error: string
}

const EXAMPLE_CSV = `name,category,description,flatPrice,cost,imageUrl
AC Tune-Up,Maintenance,Annual AC tune-up and filter check,149.99,60.00,
Capacitor Replacement,Repair,Standard run capacitor swap,185.00,12.50,
Refrigerant Recharge (1 lb),Repair,R-410A per pound,95.00,22.00,`

export function ImportForm() {
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? '')
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await importPriceBookItems(csvText)
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground font-mono mb-2">Expected header row:</p>
          <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre">
            {EXAMPLE_CSV}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>flatPrice</strong> and <strong>name</strong> are required. <strong>cost</strong> is
            internal-only and never shown to customers.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="csv-file">Upload CSV file</Label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="csv-text">Or paste CSV directly</Label>
        <Textarea
          id="csv-text"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
          placeholder={`name,category,description,flatPrice,cost,imageUrl\nAC Tune-Up,Maintenance,,149.99,,`}
          className="font-mono text-sm"
        />
      </div>

      <Button onClick={handleImport} disabled={loading || !csvText.trim()}>
        {loading ? 'Importing...' : 'Import'}
      </Button>

      {result && (
        <div className="space-y-3">
          {result.success ? (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex gap-6 text-sm font-medium">
                <span className="text-green-700">Created: {result.created}</span>
                <span className="text-blue-700">Updated: {result.updated}</span>
                <span className="text-muted-foreground">Skipped: {result.skipped}</span>
              </div>
              {result.errors.length > 0 && (
                <ul className="text-sm text-destructive space-y-1 mt-2">
                  {result.errors.map((err) => (
                    <li key={err.line}>
                      Line {err.line}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
