import { Module } from '@nestjs/common';
import { FakeProviderWebhookAdapter } from './application/fake-provider-webhook.adapter';
import { LocalFakeProviderLedger } from './infrastructure/fake-provider-ledger';
import { DemoFakeInboxController } from './presentation/demo-fake-inbox.controller';
import { DemoFakeInboxService } from './application/demo-fake-inbox.service';

@Module({ controllers: [DemoFakeInboxController], providers: [LocalFakeProviderLedger, { provide: FakeProviderWebhookAdapter, useFactory: (ledger: LocalFakeProviderLedger) => new FakeProviderWebhookAdapter(ledger), inject: [LocalFakeProviderLedger] }, DemoFakeInboxService], exports: [FakeProviderWebhookAdapter] })
export class CommunicationsModule {}

