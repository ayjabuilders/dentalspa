import {LocalInstallmentsService} from './application/local-installments.service';
import {LocalInstallmentsController,LocalInstallmentRemindersController} from './presentation/local-installments.controller';
import { LocalPaymentConfigurationService } from './application/local-payment-configuration.service';
import { LocalPaymentConfigurationController } from './presentation/local-payment-configuration.controller';
import { Module } from '@nestjs/common';
import { QuoteDraftsService } from './application/quote-drafts.service';
import { QuoteDraftsController } from './presentation/quote-drafts.controller';
import { LocalInvoicesController } from './presentation/local-invoices.controller';
import { LocalInvoicesService } from './application/local-invoices.service';
import { LocalPaymentsService } from './application/local-payments.service';
import { LocalPaymentsController } from './presentation/local-payments.controller';
@Module({ controllers: [LocalInstallmentsController,LocalInstallmentRemindersController, LocalPaymentConfigurationController, QuoteDraftsController, LocalInvoicesController, LocalPaymentsController], providers: [LocalInstallmentsService, LocalPaymentConfigurationService, QuoteDraftsService, LocalInvoicesService, LocalPaymentsService] })
export class FinanceModule {}
