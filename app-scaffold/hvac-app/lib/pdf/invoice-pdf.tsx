import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottom: 2, borderColor: '#0f766e', paddingBottom: 12 },
  brand: { fontSize: 20, fontWeight: 'bold', color: '#0f766e' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  section: { marginBottom: 16 },
  label: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
  row: { flexDirection: 'row', paddingVertical: 6, borderBottom: 1, borderColor: '#e2e8f0' },
  th: { fontWeight: 'bold', backgroundColor: '#f1f5f9', paddingVertical: 6 },
  col1: { flex: 3 },
  col2: { flex: 1, textAlign: 'right' },
  col3: { flex: 1, textAlign: 'right' },
  col4: { flex: 1, textAlign: 'right' },
  totals: { marginTop: 8, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: { fontSize: 14, fontWeight: 'bold', color: '#0f766e', borderTop: 1, borderColor: '#0f766e', paddingTop: 6, marginTop: 4 },
  notes: { marginTop: 20, padding: 12, backgroundColor: '#f8fafc', fontSize: 10 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#94a3b8', fontSize: 9 },
})

const fmt = (cents: number) => '$' + (cents / 100).toFixed(2)

type InvoicePdfProps = {
  orgName: string
  invoiceNumber: string
  status: string
  createdAt: Date
  dueDate: Date | null
  customerName: string
  customerAddress: string
  customerEmail: string | null
  customerPhone: string | null
  descriptionOfWork: string | null
  lineItems: { name: string; description: string | null; quantity: number; unitPriceCents: number; lineTotalCents: number }[]
  subtotalCents: number
  taxCents: number
  taxRateBps?: number
  totalCents: number
  outstandingCents: number
  notes: string | null
}

export function InvoicePdf(p: InvoicePdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{p.orgName}</Text>
            <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Powered by FieldClose</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>INVOICE #{p.invoiceNumber}</Text>
            <Text style={{ fontSize: 10, color: '#64748b' }}>Status: {p.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={s.label}>Bill To</Text>
            <Text style={{ fontWeight: 'bold' }}>{p.customerName}</Text>
            {p.customerAddress ? <Text>{p.customerAddress}</Text> : null}
            {p.customerEmail ? <Text>{p.customerEmail}</Text> : null}
            {p.customerPhone ? <Text>{p.customerPhone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Issued</Text>
            <Text>{new Date(p.createdAt).toLocaleDateString()}</Text>
            {p.dueDate ? (
              <>
                <Text style={[s.label, { marginTop: 6 }]}>Due</Text>
                <Text>{new Date(p.dueDate).toLocaleDateString()}</Text>
              </>
            ) : null}
          </View>
        </View>

        {p.descriptionOfWork ? (
          <View style={s.section}>
            <Text style={s.label}>Description of Work</Text>
            <Text>{p.descriptionOfWork}</Text>
          </View>
        ) : null}

        <View style={[s.row, s.th]}>
          <Text style={s.col1}>Item</Text>
          <Text style={s.col2}>Qty</Text>
          <Text style={s.col3}>Unit Price</Text>
          <Text style={s.col4}>Total</Text>
        </View>
        {p.lineItems.map((li, i) => (
          <View key={i} style={s.row}>
            <View style={s.col1}>
              <Text>{li.name}</Text>
              {li.description ? <Text style={{ color: '#64748b', fontSize: 9 }}>{li.description}</Text> : null}
            </View>
            <Text style={s.col2}>{li.quantity}</Text>
            <Text style={s.col3}>{fmt(li.unitPriceCents)}</Text>
            <Text style={s.col4}>{fmt(li.lineTotalCents)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Subtotal</Text>
            <Text>{fmt(p.subtotalCents)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>Tax{p.taxRateBps ? ` (${(p.taxRateBps / 100).toFixed(2)}%)` : ''}</Text>
            <Text>{fmt(p.taxCents)}</Text>
          </View>
          <View style={[s.totalRow, s.grandTotal]}>
            <Text>Total</Text>
            <Text>{fmt(p.totalCents)}</Text>
          </View>
          {p.outstandingCents > 0 && p.outstandingCents !== p.totalCents ? (
            <View style={s.totalRow}>
              <Text>Balance Due</Text>
              <Text>{fmt(p.outstandingCents)}</Text>
            </View>
          ) : null}
        </View>

        {p.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text>{p.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer}>Thank you for your business.</Text>
      </Page>
    </Document>
  )
}
