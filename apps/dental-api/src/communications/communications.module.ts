import { Module } from '@nestjs/common';
import { FakeProviderWebhookAdapter } from './application/fake-provider-webhook.adapter.js';
import { LocalFakeProviderLedger } from './infrastructure/fake-provider-ledger.js';
import { DemoFakeInboxController } from './presentation/demo-fake-inbox.controller.js';
import { DemoFakeInboxService } from './application/demo-fake-inbox.service.js';

@Module({ controllers: [DemoFakeInboxController], providers: [LocalFakeProviderLedger, { provide: FakeProviderWebhookAdapter, useFactory: (ledger: LocalFakeProviderLedger) => new FakeProviderWebhookAdapter(ledger), inject: [LocalFakeProviderLedger] }, DemoFakeInboxService], exports: [FakeProviderWebhookAdapter] })
export class CommunicationsModule {}

