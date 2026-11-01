export const PRIVATE_DOCUMENT_STORAGE = Symbol('PRIVATE_DOCUMENT_STORAGE');
export interface PrivateDocumentStorage {
  upload(path: string, bytes: Buffer, contentType: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  download(path: string): Promise<Buffer | null>;
  signedDownload?(path: string, expiresIn: number): Promise<string | null>;
  signedUpload?(path: string): Promise<string | null>;
}
