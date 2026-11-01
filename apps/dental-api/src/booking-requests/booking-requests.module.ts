import { Module } from '@nestjs/common';
import { BookingRequestsController } from './booking-requests.controller.js';
import { BookingRequestsService } from './booking-requests.service.js';
import { AgendaSettingsController } from './agenda-settings.controller.js';
import { AgendaSettingsService } from './agenda-settings.service.js';
import { PublicAgendaService } from './public-agenda.service.js';

@Module({ controllers: [BookingRequestsController, AgendaSettingsController], providers: [BookingRequestsService, AgendaSettingsService, PublicAgendaService] })
export class BookingRequestsModule {}
