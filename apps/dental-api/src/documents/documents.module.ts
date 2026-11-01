import { Module } from '@nestjs/common';
import { DocumentsController } from './presentation/documents.controller.js';
import { DocumentsService } from './application/documents.service.js';
import { PRIVATE_DOCUMENT_STORAGE } from './domain/private-document-storage.js';
import { SupabasePrivateDocumentStorage } from './infrastructure/supabase-private-document-storage.js';
import { PatientDocumentLibraryService } from './application/document-library.service.js';
import { DocumentLibraryController } from './presentation/document-library.controller.js';
import { StagingCleanupController } from './presentation/staging-cleanup.controller.js';
@Module({ controllers: [DocumentsController,DocumentLibraryController,StagingCleanupController], providers: [DocumentsService,PatientDocumentLibraryService, {provide:PRIVATE_DOCUMENT_STORAGE,useClass:SupabasePrivateDocumentStorage}], exports: [DocumentsService,PatientDocumentLibraryService] })
export class DocumentsModule {}

