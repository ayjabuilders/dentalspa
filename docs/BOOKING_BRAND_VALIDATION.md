# Dental Spa booking brand — 2026-11-01

Owner reference: ivory/gold booking steps and a photographic mobile welcome.
The experience has ten separate screens: welcome, visit choice, cabinet,
smiles, date/time, contact, review, server receipt, accompaniment, and cabinet
address. Each displays one active screen. Post-receipt navigation retains the
receipt and never resubmits the command. Staff-review semantics and idempotent
recovery remain unchanged.
No fake photo-upload, provider assignment, WhatsApp delivery or confirmed booking
was added. The supplied logo lettering is retained with an SVG alpha filter.

Assets are owner supplied: Dr Amina portrait, smile photo and logo reference.
The small portrait stack uses existing illustrative assets (decorative, no names
or fabricated quotes). The owner supplied the social-proof quantity and approved
the phrasing direction; it is not an independently measured application metric.
No real patient import files are in public assets or source control.

Local preview: port 4220, development-only proxy to the approved validation API
for public booking requests. This proxy is disabled outside development. Hosted
builds use their existing configured API origin and CORS rules.

Verification:
- TypeScript and scoped ESLint passed.
- Production booking build passed.
- Playwright 320/390/1440: welcome, error/retry, calendar month/day selection,
  contact retention, review/edit, conflict/new command, uncertain replay/same
  command, pending receipt, overflow and 44px controls passed. Writes are mocked.
- Real local-to-hosted catalogue read returned three configured visit types.
- Local screenshots inspected for welcome and connected service selection.
- Earlier actual deployed booking API acceptance remains separate evidence.

Latest local verification (2026-11-01): all ten screens, retained receipt after
accompaniment/address navigation, and phone normalization passed at 320/390/1440.
The international phone field is required by the new UI, optional in the API
contract for compatibility with earlier clients, included in the private command
payload, and displayed/searchable in the authorized admin inbox. API/migration
integration: 24 tests passed, including malformed phone rejection and absence of
contact information in the public receipt. These HTTP tests mock persistence;
the embedded PostgreSQL test applies the complete migration chain but does not
yet prove the new phone write/read workflow on hosted Supabase.

Coordinated release: API `dpl_8qUM3WySnMAqVvTRecE4w3ZYpXXN` and clinic
`dpl_9mUhqzPeHnmhmfMJUZAkuxQh17ba` are Ready. Hosted migration
`20261101083949_configured_booking_phone.sql` applied successfully. Actual
Vercel API acceptance passed: synthetic request with phone persisted, exact
replay, same-clinic owner read returned that phone, anonymous 401 and foreign
clinic 403. Evidence: ignored `.local/qa/deployed-booking-phone-smoke.json`.
The two earlier requests were also returned by the owner's authenticated API.
Booking frontend `dpl_7AQvYk5uDbBKFYBn7JsAJutnc2kz` is Ready. Actual deployed
catalogue/slot reads passed; all ten-screen browser interactions passed at
320/390/1440 with mocked writes. Separately, actual mobile admin browser login,
the persisted synthetic request, phone detail and return to the inbox passed.
Evidence: `.local/qa/deployed-booking-admin-phone.png` and the ignored browser
 verification scripts. Automatic new-request notifications remain incomplete.
Real-contact activation remains incomplete; synthetic restrictions are retained.

Admin notice follow-up: clinic deployment `dpl_GACaBgYhePYSePQ1FDYtiC1jfinb`
is Ready. Manager/reception header shows pending bookings from the existing
authorized endpoint, polling every 30 seconds only while visible/online and on
focus. Clicking opens/refetches the inbox, without interrupting locked actions.
Read failures clear the count and explicitly report unavailability. Requests are
aborted on unmount/workspace change; no patient details are stored by the notice.
Actual deployed mobile browser verified count, navigation, action lock, simulated
read failure and real recovery. Evidence `.local/qa/check-booking-notice.mjs` and
`.local/qa/deployed-booking-notice.png`. This is in-app pending-work awareness,
not a durable unread-notification inbox, push delivery or external email.

The release remains a validation environment with synthetic booking data. The
design is an implementation of the reference direction, not owner visual sign-off.
