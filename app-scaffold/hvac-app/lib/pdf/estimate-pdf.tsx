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
  depositRow: { flexDirection: 'row', width: 200, justifyContent: 'space-between', paddingVertical: 3, color: '#0f766e' },
  depositPaid: { flexDirection: 'row', width: 200, justifyContent: 'space-between', paddingVertical: 3, color: '#16a34a' },
  box: { marginTop: 14, padding: 12, backgroundColor: '#f8fafc', fontSize: 10 },
  sigBlock: { marginTop: 20, padding: 12, backgroundColor: '#f0fdf4', borderLeft: 3, borderColor: '#16a34a', fontSize: 10 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#94a3b8', fontSize: 9 },
})

const fmt = (cents: number) => '$' + (cents / 100).toFixed(2)

type EstimatePdfProps = {
  orgName: string
  estimateNumber: string
  status: string
  createdAt: Date
  customerName: string
  customerAddress: string
  customerEmail: string | null
  customerPhone: string | null
  scopeOfWork: string | null
  terms: string | null
  lineItems: { name: string; description: string | null; quantity: number; unitPriceCents: number; lineTotalCents: number }[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  depositRequired: boolean
  depositStatus: string
  depositPaidAt: Date | null
  depositCents: number
  acceptedAt: Date | null
  signerName: string | null
}

export function EstimatePdf(p: EstimatePdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{p.orgName}</Text>
            <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Powered by FieldClose</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>ESTIMATE #{p.estimateNumber}</Text>
            <Text style={{ fontSize: 10, color: '#64748b' }}>Status: {p.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={s.label}>Prepared For</Text>
            <Text style={{ fontWeight: 'bold' }}>{p.customerName}</Text>
            {p.customerAddress ? <Text>{p.customerAddress}</Text> : null}
            {p.customerEmail ? <Text>{p.customerEmail}</Text> : null}
            {p.customerPhone ? <Text>{p.customerPhone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Issued</Text>
            <Text>{new Date(p.createdAt).toLocaleDateString()}</Text>
          </View>
        </View>

        {p.scopeOfWork ? (
          <View style={s.section}>
            <Text style={s.label}>Scope of Work</Text>
            <Text>{p.scopeOfWork}</Text>
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
            <Text>Tax</Text>
            <Text>{fmt(p.taxCents)}</Text>
          </View>
          <View style={[s.totalRow, s.grandTotal]}>
            <Text>Estimate Total</Text>
            <Text>{fmt(p.totalCents)}</Text>
          </View>
          {p.depositRequired ? (
            p.depositStatus === 'paid' && p.depositPaidAt ? (
              <View style={s.depositPaid}>
                <Text>Deposit paid on {new Date(p.depositPaidAt).toLocaleDateString()}</Text>
                <Text>{fmt(p.depositCents)}</Text>
              </View>
            ) : (
              <View style={s.depositRow}>
                <Text>Deposit due on approval</Text>
                <Text>{fmt(p.depositCents)}</Text>
              </View>
            )
          ) : null}
        </View>

        {p.terms ? (
          <View style={s.box}>
            <Text style={s.label}>Terms</Text>
            <Text>{p.terms}</Text>
          </View>
        ) : null}

        {p.status === 'accepted' && p.acceptedAt ? (
          <View style={s.sigBlock}>
            <Text style={[s.label, { color: '#16a34a' }]}>Accepted</Text>
            {p.signerName ? <Text style={{ fontWeight: 'bold' }}>{p.signerName}</Text> : null}
            <Text style={{ color: '#64748b', marginTop: 2 }}>
              {new Date(p.acceptedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
          </View>
        ) : null}

        <Text style={s.footer}>This estimate is valid for 30 days unless otherwise specified.</Text>
      </Page>
    </Document>
  )
}
