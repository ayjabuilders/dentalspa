import { BadRequestException, Body, Controller, Get, Header, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { PatientDocumentSectionSchema, PatientGeneratedTypeSchema, PatientDocumentListSchema, PatientDocumentTemplatesSchema, PatientDocumentDraftListSchema, PatientDocumentDraftSchema, PatientDocumentDraftVersionsSchema, PatientDocumentUploadReceiptSchema, PatientDocumentDraftReceiptSchema, CreatePatientDocumentDraftSchema, UpdatePatientDocumentDraftSchema, ValidatePatientDocumentDraftSchema } from '@dental/contracts';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard';
import { DocumentsService } from '../application/documents.service';
import { LibraryDownloadSchema } from '@dental/contracts';

type UploadFile = { buffer:Buffer; size:number; mimetype:string };
type ApiSchema = Extract<Parameters<typeof ApiBody>[0],{schema:unknown}>['schema'];

@ApiTags('patient-documents') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('patients/:patientId/documents')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}
  private query(query:Record<string,unknown>,allowed:string[]) { if(Object.keys(query).some(key=>!allowed.includes(key))) throw new BadRequestException('Invalid patient document query'); }

  @Get() @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Query() query:Record<string,unknown>) {
    this.query(query,['section','q','cursor']);
    const section=PatientDocumentSectionSchema.safeParse(query.section), q=typeof query.q==='string'?query.q:undefined, cursor=typeof query.cursor==='string'?query.cursor:undefined;
    if(!section.success || (query.q!==undefined&&q===undefined) || (query.cursor!==undefined&&cursor===undefined)) throw new BadRequestException('Invalid patient document query');
    return this.documents.list(request.actor,patientId,section.data,q,cursor);
  }
  @Get('templates') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentTemplatesSchema,{target:'openapi-3.0'}) as ApiSchema})
  templates(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Query() query:Record<string,unknown>) {
    this.query(query,['type']); const type=PatientGeneratedTypeSchema.safeParse(query.type); if(!type.success) throw new BadRequestException('Invalid document template query'); return this.documents.templates(r.actor,patientId,type.data);
  }
  @Get('drafts') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentDraftListSchema,{target:'openapi-3.0'}) as ApiSchema})
  drafts(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Query() query:Record<string,unknown>) {
    this.query(query,['type','q','cursor']); const type=query.type===undefined?undefined:PatientGeneratedTypeSchema.safeParse(query.type); const q=typeof query.q==='string'?query.q:undefined; const cursor=typeof query.cursor==='string'?query.cursor:undefined;
    if(type!==undefined&&(!type.success)||query.q!==undefined&&q===undefined||query.cursor!==undefined&&cursor===undefined) throw new BadRequestException('Invalid document draft query');
    return this.documents.listDrafts(r.actor,patientId,type&&type.success?type.data:undefined,q,cursor);
  }
  @Post('uploads') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiHeader({name:'X-Document-Section',required:true}) @ApiHeader({name:'X-Document-Category',required:true}) @ApiHeader({name:'X-Document-Date',required:true}) @ApiHeader({name:'X-Document-Title',required:true})
  @ApiConsumes('multipart/form-data') @ApiBody({schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}}}})
  @ApiCreatedResponse({schema:z.toJSONSchema(PatientDocumentUploadReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:20*1024*1024,files:1}}))
  upload(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Headers('x-document-section') section:unknown,@Headers('x-document-category') category:unknown,@Headers('x-document-title') title:unknown,@Headers('x-document-date') date:unknown,@Headers('idempotency-key') key:unknown,@UploadedFile() file?:UploadFile) {
    const parsedSection=PatientDocumentSectionSchema.safeParse(section);
    if(!parsedSection.success||typeof category!=='string'||typeof title!=='string'||typeof date!=='string'||typeof key!=='string') throw new BadRequestException('Invalid patient document upload metadata');
    return this.documents.upload(r.actor,patientId,parsedSection.data,category,title,date,file,key,r.correlationId);
  }
  @Get('drafts/:draftId/versions') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentDraftVersionsSchema,{target:'openapi-3.0'}) as ApiSchema})
  versions(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('draftId',new ParseUUIDPipe()) draftId:string) { return this.documents.draftVersions(r.actor,patientId,draftId); }
  @Get('drafts/:draftId') @Access('staff')
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentDraftSchema,{target:'openapi-3.0'}) as ApiSchema})
  draft(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('draftId',new ParseUUIDPipe()) draftId:string) { return this.documents.draft(r.actor,patientId,draftId); }
  @Post('drafts') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(CreatePatientDocumentDraftSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(PatientDocumentDraftReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  createDraft(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown) { return this.documents.createDraft(r.actor,patientId,body,key as string,r.correlationId); }
  @Patch('drafts/:draftId') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(UpdatePatientDocumentDraftSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiOkResponse({schema:z.toJSONSchema(PatientDocumentDraftReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  updateDraft(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('draftId',new ParseUUIDPipe()) draftId:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown) { return this.documents.updateDraft(r.actor,patientId,draftId,body,key as string,r.correlationId); }
  @Post('drafts/:draftId/validate') @Access('staff') @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(ValidatePatientDocumentDraftSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiCreatedResponse({schema:z.toJSONSchema(PatientDocumentUploadReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  validateDraft(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('draftId',new ParseUUIDPipe()) draftId:string,@Body() body:unknown,@Headers('idempotency-key') key:unknown) { return this.documents.validateDraft(r.actor,patientId,draftId,body,key as string,r.correlationId); }
  @Get(':documentId/content-link') @Access('staff') @Header('Cache-Control','no-store')
  @ApiOkResponse({schema:z.toJSONSchema(LibraryDownloadSchema,{target:'openapi-3.0'}) as ApiSchema})
  downloadLink(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('documentId',new ParseUUIDPipe()) documentId:string,@Query() query:Record<string,unknown>) {
    this.query(query,[]);
    return this.documents.downloadLink(r.actor,patientId,documentId);
  }
  @Get(':documentId/content') @Access('staff')
  async content(@Req() r:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('documentId',new ParseUUIDPipe()) documentId:string,@Res() response:Response) {
    const value=await this.documents.content(r.actor,patientId,documentId);
    if(value.type==='generated') { response.type('application/json'); response.json(value.body); return; }
    response.type(value.contentType); response.setHeader('Content-Length',value.body.byteLength); response.setHeader('Content-Disposition','inline'); response.send(value.body); return;
  }
}
