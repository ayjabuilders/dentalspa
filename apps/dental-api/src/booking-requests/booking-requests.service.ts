import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfiguredBookingListSchema, ConfirmDemoBookingResponseSchema, ConfirmDemoBookingSchema, CreateDemoBookingRequestSchema, DemoBookingRequestAcknowledgementSchema, DemoBookingRequestListSchema } from '@dental/contracts';
import type { Actor } from '../identity/domain/access';
import { DemoBookingAvailabilityQuerySchema, DemoBookingAvailabilitySchema } from '@dental/contracts';
import { scopedClient } from '../identity/infrastructure/supabase';
import { configuredBookingActivationKey } from '../identity/infrastructure/module-activation';
import { ConfirmConfiguredBookingSchema, ConfiguredBookingConfirmationSchema } from '@dental/contracts';
import { z } from 'zod';

function localPersistenceConfigured() {
  if (process.env.ENABLE_DEMO_BOOKING_REQUESTS !== 'true' || !process.env.DEMO_BOOKING_DATABASE_GATE_KEY) return false;
  try {
    const url = new URL(process.env.SUPABASE_URL ?? '');
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

function localConfirmationConfigured() {
  if (process.env.ENABLE_DEMO_BOOKING_CONFIRMATIONS !== 'true' || !process.env.DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY) return false;
  try {
    const url = new URL(process.env.SUPABASE_URL ?? '');
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

@Injectable()
export class BookingRequestsService {
  async confirmConfigured(actor:Actor,id:unknown,input:unknown,key:unknown) {
    if(!actor.roles.some(role=>role==='reception'||role==='manager'))throw new ForbiddenException('Reception or manager access required');
    const command=ConfirmConfiguredBookingSchema.safeParse(input);
    if(!command.success||!z.uuid().safeParse(id).success||!z.uuid().safeParse(key).success)throw new BadRequestException('Valid request, revision and idempotency key required');
    if(!configuredBookingActivationKey())throw new ServiceUnavailableException('Appointment commands are not enabled for this environment');
    const {data,error}=await scopedClient(actor.token).rpc('confirm_local_configured_booking_request',{
      p_clinic_id:actor.clinicId,p_request_id:id,p_command_key:key,p_expected_revision:command.data.expected_revision,p_gate_key:configuredBookingActivationKey(),
    }).then(value=>value,()=>{throw new ServiceUnavailableException('Confirmation result unavailable; retry the same command');});
    if(error?.code==='42501')throw new ForbiddenException('Booking scope denied');
    if(error?.code==='SH404')throw new NotFoundException('Request not found');
    if(['SH409','SH410'].includes(error?.code??''))throw new ConflictException('Request, configuration or availability changed; refresh before confirming');
    if(['22023','22P02'].includes(error?.code??''))throw new BadRequestException('Invalid confirmation');
    if(error)throw new ServiceUnavailableException('Confirmation result unavailable; retry the same command');
    const receipt=ConfiguredBookingConfirmationSchema.safeParse(data);
    if(!receipt.success||receipt.data.request_id!==id)throw new ServiceUnavailableException('Confirmation result unavailable; retry the same command');
    return receipt.data;
  }
  async configuredList(actor:Actor) {
    if(!actor.roles.some(role=>role==='reception'||role==='manager'))throw new ForbiddenException('Reception or manager access required');
    const {data,error}=await scopedClient(actor.token).rpc('list_local_configured_booking_requests',{p_clinic_id:actor.clinicId}).then(value=>value,()=>{throw new ServiceUnavailableException('Booking requests unavailable');});
    if(error?.code==='42501')throw new ForbiddenException('Booking scope denied');
    if(error)throw new ServiceUnavailableException('Booking requests unavailable');
    const result=ConfiguredBookingListSchema.safeParse(data);
    if(!result.success)throw new ServiceUnavailableException('Booking requests unavailable');
    return {...result.data,confirmation_enabled:result.data.confirmation_enabled===true&&!!configuredBookingActivationKey()};
  }
  async availability(input: unknown) {
    if (!localConfirmationConfigured()) throw new ServiceUnavailableException('Local demo availability is disabled');
    const query = DemoBookingAvailabilityQuerySchema.safeParse(input);
    if (!query.success) throw new BadRequestException('A valid date is required');
    const { data, error } = await scopedClient().rpc('list_demo_booking_availability', {
      p_date: query.data.date, p_gate_key: process.env.DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY,
    }).then(result => result, () => { throw new ServiceUnavailableException('Local availability unavailable'); });
    if (error?.code === '22023') throw new BadRequestException('Date outside the local booking window');
    if (error) throw new ServiceUnavailableException('Local availability unavailable');
    const result = DemoBookingAvailabilitySchema.safeParse({ date: query.data.date, time_zone: 'Africa/Casablanca', duration_minutes: 45, informational: true, slots: data });
    if (!result.success) throw new ServiceUnavailableException('Local availability unavailable');
    return result.data;
  }

  demoStatus() {
    return { enabled: localPersistenceConfigured(), confirmation_enabled: localConfirmationConfigured() };
  }

  async create(input: unknown, requestKey: string) {
    if (!localPersistenceConfigured()) throw new ServiceUnavailableException({ statusCode: 503, code: 'demo_booking_requests_disabled', message: 'Local demo requests are disabled' });
    const payload = CreateDemoBookingRequestSchema.safeParse(input);
    if (!payload.success) throw new BadRequestException('Invalid synthetic booking request');
    try {
      const { data, error } = await scopedClient().rpc('create_demo_booking_request', {
        p_request_key: requestKey,
        p_scenario_id: payload.data.scenario_id,
        p_requested_date: payload.data.requested_date,
        p_requested_time: payload.data.requested_time,
        p_gate_key: process.env.DEMO_BOOKING_DATABASE_GATE_KEY,
      });
      if (error) {
        if (['22023', '22007', '22008', '22P02'].includes(error.code ?? '')) throw new BadRequestException('Invalid synthetic booking request');
        if (error.code === '42501') throw new ForbiddenException('Demo booking request scope denied');
        if (error.code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'demo_booking_requests_disabled', message: 'Local demo requests are disabled' });
        throw new Error('database');
      }
      const result = DemoBookingRequestAcknowledgementSchema.safeParse(data);
      if (!result.success) throw new Error('response');
      return result.data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Demo booking request unavailable');
    }
  }

  async list(actor: Actor) {
    if (!actor.roles.some(role => role === 'reception' || role === 'manager')) throw new ForbiddenException('Reception or manager access required');
    try {
      const { data, error } = await scopedClient(actor.token).rpc('list_demo_booking_requests', { p_clinic_id: actor.clinicId });
      if (error) {
        if (error.code === '42501') throw new ForbiddenException('Demo booking request scope denied');
        throw new Error('database');
      }
      const result = DemoBookingRequestListSchema.safeParse({ items: data ?? [] });
      if (!result.success) throw new Error('response');
      return result.data;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException('Demo booking request list unavailable');
    }
  }

  async confirm(actor: Actor, requestId: string, input: unknown, requestKey: string) {
    if (!localConfirmationConfigured()) throw new ServiceUnavailableException({ statusCode: 503, code: 'demo_booking_confirmation_disabled', message: 'Local demo confirmations are disabled' });
    if (!actor.roles.some(role => role === 'reception' || role === 'manager')) throw new ForbiddenException('Reception or manager access required');
    const payload = ConfirmDemoBookingSchema.safeParse(input);
    if (!payload.success) throw new BadRequestException('Invalid sample resources');
    try {
      const { data, error } = await scopedClient(actor.token).rpc('confirm_demo_booking_request', {
        p_clinic_id: actor.clinicId,
        p_booking_request_id: requestId,
        p_provider_resource_id: payload.data.provider_resource_id,
        p_chair_resource_id: payload.data.chair_resource_id,
        p_request_key: requestKey,
        p_gate_key: process.env.DEMO_BOOKING_CONFIRM_DATABASE_GATE_KEY,
      });
      if (error) {
        if (['22023', '22P02', '22007', '22008'].includes(error.code ?? '')) throw new BadRequestException('The request does not fit the labelled sample booking rules');
        if (error.code === '42501') throw new ForbiddenException('Demo booking confirmation scope denied');
        if (error.code === 'SH404') throw new NotFoundException('Demo booking request not found');
        if (['SH409', 'SH410', 'SH412', '23P01'].includes(error.code ?? '')) throw new ConflictException('The sample resource is no longer available or the request was already confirmed');
        if (error.code === 'PT503') throw new ServiceUnavailableException({ statusCode: 503, code: 'demo_booking_confirmation_disabled', message: 'Local demo confirmations are disabled' });
        throw new Error('database');
      }
      const result = ConfirmDemoBookingResponseSchema.safeParse(data);
      if (!result.success) throw new Error('response');
      return result.data;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Local demo confirmation unavailable');
    }
  }
}
