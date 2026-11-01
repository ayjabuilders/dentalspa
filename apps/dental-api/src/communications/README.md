# Local communications adapter boundary

`FakeProviderWebhookAdapter` accepts only signed, strictly validated `DEMO-CHAT-*` events. The signature covers the exact request bytes. `LocalFakeProviderLedger` is process memory for deterministic local fake-server checks; it is not a database repository, tenant inbox, message-retention policy, or production provider integration.

Inbound text and outbound delivery-status examples contain no real contact identifiers or patient references. Event IDs and message IDs are idempotent. Delivery sequence numbers reject stale events. An unknown provider result is recorded as uncertain and blocks automatic retry; failed delivery also never triggers automatic retry. A later conflicting result requires reconciliation rather than being presented as confirmed.

The adapter has no HTTP route, credentials, network client, send method, persistence, patient linking, or activation switch. The next implementation stage needs the reviewed provider/tenant-routing contract and a durable PostgreSQL repository. Do not mark CRM-MVP-08 accepted based on this local adapter alone.
