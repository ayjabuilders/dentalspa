import {BadRequestException,Body,Controller,Get,Header,Headers,Inject,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiBody,ApiCreatedResponse,ApiHeader,ApiOkResponse,ApiTags} from '@nestjs/swagger';
import {LocalPaymentConfigurationSchema,SaveLocalReceivingAccountSchema,LocalReceivingAccountReceiptSchema,SaveLocalPaymentMethodSchema,LocalPaymentMethodReceiptSchema} from '@dental/contracts';
import {z} from 'zod';
import {Access,type AuthorizedRequest} from '../../identity/presentation/policy.guard';
import {LocalPaymentConfigurationService} from '../application/local-payment-configuration.service';
type ApiSchema=Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];
@ApiTags('finance') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('finance/payment-configuration')
export class LocalPaymentConfigurationController {
 constructor(@Inject(LocalPaymentConfigurationService) private readonly configuration:LocalPaymentConfigurationService){}
 @Get() @Access('staff') @Header('Cache-Control','no-store')
 @ApiOkResponse({schema:z.toJSONSchema(LocalPaymentConfigurationSchema,{target:'openapi-3.0'}) as ApiSchema})
 read(@Req() req:AuthorizedRequest){if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.configuration.read(req.actor);}
 @Post('accounts') @Access('staff') @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
 @ApiBody({schema:z.toJSONSchema(SaveLocalReceivingAccountSchema,{target:'openapi-3.0'}) as ApiSchema})
 @ApiCreatedResponse({schema:z.toJSONSchema(LocalReceivingAccountReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
 account(@Req() req:AuthorizedRequest,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.configuration.account(req.actor,body,key);}
 @Post('methods') @Access('staff') @Header('Cache-Control','no-store') @ApiHeader({name:'Idempotency-Key',required:true})
 @ApiBody({schema:z.toJSONSchema(SaveLocalPaymentMethodSchema,{target:'openapi-3.0'}) as ApiSchema})
 @ApiCreatedResponse({schema:z.toJSONSchema(LocalPaymentMethodReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
 method(@Req() req:AuthorizedRequest,@Body() body:unknown,@Headers('idempotency-key') key:unknown){if(Object.keys(req.query).length)throw new BadRequestException('Query parameters not supported');return this.configuration.method(req.actor,body,key);}
}
