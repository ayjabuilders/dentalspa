import { BadRequestException, Body, Controller, Delete, Get, Headers, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LibraryDeleteReceiptSchema, LibraryListSchema, LibraryOptionsSchema, LibraryReceiptSchema } from '@dental/contracts';
import { z } from 'zod';
import { LibraryUploadStartSchema, LibraryUploadFinishSchema, LibraryUploadTicketSchema } from '@dental/contracts';
import { Access, type AuthorizedRequest } from '../../identity/presentation/policy.guard.js';
import { PatientDocumentLibraryService } from '../application/document-library.service.js';

type ApiSchema = Extract<Parameters<typeof ApiBody>[0], {schema:unknown}>['schema'];
type LibraryUploadFile = { buffer:Buffer; size:number; mimetype:string; originalname?:string };

@ApiTags('patient-document-library') @ApiBearerAuth() @ApiHeader({name:'X-Clinic-Id',required:true})
@Controller('patients/:patientId/documents/library') @Access('staff')
export class DocumentLibraryController {
  constructor(private readonly library:PatientDocumentLibraryService) {}
  private query(query:Record<string,unknown>,allowed:string[]) { if(Object.keys(query).some(key=>!allowed.includes(key))) throw new BadRequestException('Invalid document library query'); }
  private key(value:unknown) { if(typeof value!=='string'||!z.uuid().safeParse(value).success) throw new BadRequestException('Invalid idempotency key'); return value; }

  @Get() @Header('Cache-Control','no-store') @ApiOperation({summary:'List uploaded patient files in the authorized document library'})
  @ApiQuery({name:'q',required:false,maxLength:100}) @ApiQuery({name:'category',required:false}) @ApiQuery({name:'cursor',required:false,maxLength:300}) @ApiQuery({name:'section',required:false,enum:['administrative','clinical']})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryListSchema,{target:'openapi-3.0'}) as ApiSchema})
  list(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Query() query:Record<string,unknown>,@Body() body:unknown) {
    if(body!==undefined||Number(request.headers['content-length']??0)>0||request.headers['transfer-encoding']!==undefined) throw new BadRequestException('Unexpected request body');
    this.query(query,['q','category','cursor','section']);
    const q=query.q===undefined?undefined:typeof query.q==='string'?query.q:undefined;
    const category=query.category===undefined?undefined:typeof query.category==='string'?query.category:undefined;
    const cursor=query.cursor===undefined?undefined:typeof query.cursor==='string'?query.cursor:undefined;
    const section=query.section===undefined?undefined:typeof query.section==='string'?query.section:undefined;
    if(query.q!==undefined&&q===undefined||query.category!==undefined&&category===undefined||query.cursor!==undefined&&cursor===undefined||query.section!==undefined&&section===undefined) throw new BadRequestException('Invalid document library query');
    if(section!==undefined&&section!=='administrative'&&section!=='clinical') throw new BadRequestException('Invalid document section');
    return this.library.list(request.actor,patientId,q,category,cursor,section);
  }

  @Get('options') @Header('Cache-Control','no-store') @ApiOperation({summary:'List document filing categories and same-patient confirmed appointment links'})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryOptionsSchema,{target:'openapi-3.0'}) as ApiSchema})
  options(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Query() query:Record<string,unknown>,@Body() body:unknown) {
    if(Object.keys(query).length||body!==undefined||Number(request.headers['content-length']??0)>0||request.headers['transfer-encoding']!==undefined) throw new BadRequestException('Unexpected request data');
    return this.library.options(request.actor,patientId);
  }

  @Post('uploads/start') @HttpCode(200) @Header('Cache-Control','no-store')
  @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(LibraryUploadStartSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryUploadTicketSchema,{target:'openapi-3.0'}) as ApiSchema})
  startUpload(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Body() body:unknown,@Headers('idempotency-key') key?:string) {
    this.query(request.query,[]);return this.library.startUpload(request.actor,patientId,body,this.key(key));
  }
  @Post('uploads/finish') @HttpCode(200) @Header('Cache-Control','no-store')
  @ApiHeader({name:'Idempotency-Key',required:true})
  @ApiBody({schema:z.toJSONSchema(LibraryUploadFinishSchema,{target:'openapi-3.0'}) as ApiSchema})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  finishUpload(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Body() body:unknown,@Headers('idempotency-key') key?:string) {
    this.query(request.query,[]);return this.library.finishUpload(request.actor,patientId,body,this.key(key),request.correlationId);
  }
  @Post('uploads') @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Store one private patient file with catalog metadata; bulk selection uses one idempotent request per file'})
  @ApiHeader({name:'Idempotency-Key',required:true}) @ApiConsumes('multipart/form-data')
  @ApiBody({schema:{type:'object',required:['file','metadata'],properties:{file:{type:'string',format:'binary'},metadata:{type:'string',description:'JSON matching LibraryMetadataSchema'}}}})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryReceiptSchema,{target:'openapi-3.0'}) as ApiSchema})
  @UseInterceptors(FileInterceptor('file',{limits:{fileSize:20*1024*1024,files:1}}))
  upload(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Body('metadata') metadata:string|undefined,@UploadedFile() file?:LibraryUploadFile,@Headers('idempotency-key') requestKey?:string) {
    if(Object.keys(request.query).length||typeof metadata!=='string') throw new BadRequestException('Invalid document upload');
    return this.library.upload(request.actor,patientId,metadata,file,this.key(requestKey),request.correlationId);
  }

  @Patch(':documentId') @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Edit document filing metadata with compare-and-set version'})
  @ApiHeader({name:'Idempotency-Key',required:true}) @ApiParam({name:'documentId',format:'uuid'}) @ApiBody({schema:{type:'object',required:['expected_version','metadata'],properties:{expected_version:{type:'integer',minimum:1},metadata:{type:'object'}}}})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryReceiptSchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:409,description:'Stale metadata version or idempotency conflict'})
  update(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('documentId',new ParseUUIDPipe()) documentId:string,@Body() body:unknown,@Headers('idempotency-key') requestKey?:string) {
    if(Object.keys(request.query).length) throw new BadRequestException('Unexpected query');
    return this.library.update(request.actor,patientId,documentId,body,this.key(requestKey),request.correlationId);
  }

  @Delete(':documentId') @HttpCode(200) @Header('Cache-Control','no-store') @ApiOperation({summary:'Archive a document without deleting private bytes; compare-and-set version required'})
  @ApiHeader({name:'Idempotency-Key',required:true}) @ApiParam({name:'documentId',format:'uuid'}) @ApiBody({schema:{type:'object',required:['expected_version'],properties:{expected_version:{type:'integer',minimum:1}}}})
  @ApiOkResponse({schema:z.toJSONSchema(LibraryDeleteReceiptSchema,{target:'openapi-3.0'}) as ApiSchema}) @ApiResponse({status:409,description:'Stale metadata version or idempotency conflict'})
  archive(@Req() request:AuthorizedRequest,@Param('patientId',new ParseUUIDPipe()) patientId:string,@Param('documentId',new ParseUUIDPipe()) documentId:string,@Body() body:unknown,@Headers('idempotency-key') requestKey?:string) {
    if(Object.keys(request.query).length) throw new BadRequestException('Unexpected query');
    return this.library.archive(request.actor,patientId,documentId,body,this.key(requestKey),request.correlationId);
  }
}
