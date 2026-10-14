type RenderEmailParams = {
  title: string
  preheader?: string
  /** Trusted template HTML. Escape every interpolated value with escapeHtml. */
  body: string
  cta?: { label: string; url: string }
  footer?: string
}

export function renderEmail({ title, preheader, body, cta, footer }: RenderEmailParams): string {
  const safeCtaUrl = cta ? httpUrl(cta.url) : null
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:22px;font-weight:700;color:#0f766e;letter-spacing:-0.5px;">FieldClose</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#334155;">${body}</div>
        ${cta && safeCtaUrl ? `
        <div style="margin:32px 0 8px;">
          <a href="${escapeAttr(safeCtaUrl)}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(cta.label)}</a>
        </div>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;">${footer ? escapeHtml(footer) + '<br>' : ''}Sent via FieldClose — the quote-to-payment platform for service teams.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

function escapeAttr(s: string): string {
  return s.replace(/["&<>]/g, (c) => ({ '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))
}

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}
