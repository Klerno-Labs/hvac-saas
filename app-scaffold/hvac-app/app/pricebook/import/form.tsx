'use client'

import { useState, useRef } from 'react'
import { importPriceBookItems } from '../import-actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

type ImportResult =
  | { success: true; created: number; updated: number; skipped: number; errors: { line: number; message: string }[] }
  | { success: false; error: string }

export default function ImportForm() {
  const [csvText, setCsvText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText((ev.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setLoading(true)
    setResult(null)
    const res = await importPriceBookItems(csvText)
    setResult(res)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csvFile">Upload CSV file</Label>
        <input
          id="csvFile"
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground cursor-pointer"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="csvText">Or paste CSV</Label>
        <Textarea
          id="csvText"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={10}
          placeholder="name,category,description,flatPrice,cost,imageUrl"
          className="font-mono text-sm"
        />
      </div>

      <Button onClick={handleImport} disabled={loading || !csvText.trim()}>
        {loading ? 'Importing...' : 'Import'}
      </Button>

      {result && (
        <Card>
          <CardContent className="pt-4">
            {result.success ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Import complete: {result.created} created, {result.updated} updated, {result.skipped} skipped
                </p>
                {result.errors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-destructive mb-1">Row errors:</p>
                    <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
                      {result.errors.map(e => (
                        <li key={e.line}>
                          Line {e.line}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-destructive">{result.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
