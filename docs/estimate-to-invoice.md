# Accepted estimate → draft invoice

An owner or team member with pricing permission and an active workspace can open an accepted estimate and choose **Create draft invoice**. The customer, job, scope, notes, line items, subtotal, and tax are copied from the approved document. No email is sent and no payment is collected during conversion. The invoice is a draft for review; the accepted estimate and its approval remain unchanged.

The invoice links back to its source estimate and shows the approved terms. Reopening the estimate shows its existing invoice. A voided invoice stays linked; conversion never silently creates another bill.

## Reliability boundaries

- Organization and actor identity come from server-owned authorization, with the same pricing and subscription checks as invoice editing.
- The transaction locks the organization and the estimate in that order. Number allocation is shared with ordinary document creation. A unique `Invoice.sourceEstimateId` constraint is the durable protection against duplicate conversion.
- Activity and audit records commit in the same transaction as the invoice, exactly once.
- Stored approved totals must match the source line items. The conversion rejects inconsistent historical amounts instead of recalculating a different customer-approved price.
- Estimates with pending or received deposit payments require reconciliation and cannot automatically become a full-balance invoice. Deposit crediting remains a separate unfinished workflow.
- Creation/edit validation rejects fractional cents, total overflow, blank item names, excessive line counts, and invalid calendar due dates. Unpriced drafts remain editable; estimates with a nonpositive total cannot be sent or manually accepted.

## Customer decisions and delivery

Customer links only allow decisions on sent estimates. A conditional write prevents an approval and a decline from overwriting one another. The decision and audit trail commit atomically. A repeat of the same completed decision is harmless; the opposite decision is rejected.

Customers may draw a signature or use their typed name, including with a keyboard. Signature payloads are bounded PNG data; the recorded audit identifies the signature method. Notification text is escaped, and a failed notification cannot erase the recorded decision.

Office estimate/invoice status actions distinguish a committed status update from email delivery. A missing customer address or failed email provider response displays a clear warning. Selecting Sent again explicitly retries delivery. Provider acceptance is not proof of inbox delivery; bounce/delivery monitoring remains a production requirement.

## Migration and verification

`0006_estimate_invoice_link` adds the optional unique source-estimate relation. It does not guess links for existing invoices. Apply migrations before deploying the new application code.

Regression coverage includes real PostgreSQL concurrency (six conversion requests create one invoice; opposing customer decisions record one result), organization/customer isolation, preserved approval and amounts, deposit rejection, replay/void behavior, notification failure, input limits, and calendar due dates. Tests use a dedicated `_test` database only.

Production acceptance still requires a verified email sender and delivery monitoring; customer terms must be reviewed by the business. Payment collection remains governed by verified Stripe webhook settlement.
