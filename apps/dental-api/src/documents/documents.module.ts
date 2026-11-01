import { Module } from '@nestjs/common';
import { DocumentsController } from './presentation/documents.controller';
import { DocumentsService } from './application/documents.service';
import { PRIVATE_DOCUMENT_STORAGE } from './domain/private-document-storage';
import { SupabasePrivateDocumentStorage } from './infrastructure/supabase-private-document-storage';
import { PatientDocumentLibraryService } from './application/document-library.service';
import { DocumentLibraryController } from './presentation/document-library.controller';
import { StagingCleanupController } from './presentation/staging-cleanup.controller';
@Module({ controllers: [DocumentsController,DocumentLibraryController,StagingCleanupController], providers: [DocumentsService,PatientDocumentLibraryService, {provide:PRIVATE_DOCUMENT_STORAGE,useClass:SupabasePrivateDocumentStorage}], exports: [DocumentsService,PatientDocumentLibraryService] })
export class DocumentsModule {}

