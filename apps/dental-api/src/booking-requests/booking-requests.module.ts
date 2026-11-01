import { Module } from '@nestjs/common';
import { BookingRequestsController } from './booking-requests.controller';
import { BookingRequestsService } from './booking-requests.service';
import { AgendaSettingsController } from './agenda-settings.controller';
import { AgendaSettingsService } from './agenda-settings.service';
import { PublicAgendaService } from './public-agenda.service';

@Module({ controllers: [BookingRequestsController, AgendaSettingsController], providers: [BookingRequestsService, AgendaSettingsService, PublicAgendaService] })
export class BookingRequestsModule {}
