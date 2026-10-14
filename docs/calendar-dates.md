# Calendar date behavior

The current scheduling product selects a day, not an appointment time. `scheduledFor` and invoice due dates therefore represent calendar dates encoded at UTC midnight. They must be displayed with `formatDateOnly`, without converting midnight into a browser-local appointment time. Date inputs reject invalid dates and timestamps.

`startOfBusinessDayAsUtcDate(now, organization.timezone)` returns the organization's current calendar date encoded at UTC midnight. For example, at `2026-09-27T02:00:00Z`, Chicago's current date is September 26, so it returns `2026-09-26T00:00:00Z`. This is a database comparison token, not the instant of Chicago midnight. Missing or invalid stored time zones fall back to UTC.

Field view uses that business-day token to select today's assigned work. The calendar uses UTC date arithmetic and an exclusive next-month boundary, avoiding host-timezone shifts. Job lists, job detail and field cards display the selected calendar date. Reminder email/SMS state the day and ask customers to confirm their arrival window; they do not invent a midnight appointment. Reminder selection chooses tomorrow in the business time zone.

`isDueDatePast(value, now, organization.timezone)` compares an invoice's date to the same business-day token, so a due date remains current until that business's calendar day has ended.

Regression coverage lives in `scheduled-calendar-dates`, `scheduled-day-queries`, `scheduled-message-dates`, `appointment-calendar-day`, and `date-only` tests. It covers US midnight boundaries, DST changes, year boundaries, UTC+14, invalid/missing zones, input validation, date-scoped queries, and actual email/SMS content.
