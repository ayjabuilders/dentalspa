import {LocalInstallmentsService} from './application/local-installments.service.js';
import {LocalInstallmentsController,LocalInstallmentRemindersController} from './presentation/local-installments.controller.js';
import { LocalPaymentConfigurationService } from './application/local-payment-configuration.service.js';
import { LocalPaymentConfigurationController } from './presentation/local-payment-configuration.controller.js';
import { Module } from '@nestjs/common';
import { QuoteDraftsService } from './application/quote-drafts.service.js';
import { QuoteDraftsController } from './presentation/quote-drafts.controller.js';
import { LocalInvoicesController } from './presentation/local-invoices.controller.js';
import { LocalInvoicesService } from './application/local-invoices.service.js';
import { LocalPaymentsService } from './application/local-payments.service.js';
import { LocalPaymentsController } from './presentation/local-payments.controller.js';
@Module({ controllers: [LocalInstallmentsController,LocalInstallmentRemindersController, LocalPaymentConfigurationController, QuoteDraftsController, LocalInvoicesController, LocalPaymentsController], providers: [LocalInstallmentsService, LocalPaymentConfigurationService, QuoteDraftsService, LocalInvoicesService, LocalPaymentsService] })
export class FinanceModule {}
