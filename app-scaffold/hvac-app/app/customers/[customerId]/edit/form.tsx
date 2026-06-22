'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCustomer } from '../edit-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type Customer = {
  id: string
  firstName: string
  lastName: string | null
  companyName: string | null
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  notes: string | null
  taxExempt: boolean
}

export function EditCustomerForm({ customer }: { customer: Customer }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await updateCustomer(customer.id, formData)

    if (result.success) {
      router.push(`/customers/${customer.id}`)
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit customer</CardTitle>
        <CardDescription>{customer.firstName} {customer.lastName || ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name *</Label>
              <Input id="firstName" name="firstName" required defaultValue={customer.firstName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" defaultValue={customer.lastName || ''} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" name="companyName" defaultValue={customer.companyName || ''} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" name="phone" type="tel" required defaultValue={customer.phone || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={customer.email || ''} />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="addressLine1">Address line 1</Label>
            <Input id="addressLine1" name="addressLine1" defaultValue={customer.addressLine1 || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input id="addressLine2" name="addressLine2" defaultValue={customer.addressLine2 || ''} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={customer.city || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" maxLength={2} defaultValue={customer.state || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">ZIP</Label>
              <Input id="postalCode" name="postalCode" defaultValue={customer.postalCode || ''} />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={customer.notes || ''} />
          </div>
          <Separator />
          <Label className="cursor-pointer flex items-center gap-2">
            <input
              type="checkbox"
              name="taxExempt"
              defaultChecked={customer.taxExempt}
              className="size-4"
            />
            <span className="text-sm font-medium">This customer is tax-exempt</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Exempt customers (resale certificate, government, non-profit) have no sales tax applied to invoices.
          </p>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save changes'}</Button>
            <Button variant="ghost" type="button" onClick={() => router.push(`/customers/${customer.id}`)}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
