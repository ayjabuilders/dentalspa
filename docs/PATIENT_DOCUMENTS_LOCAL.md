# Patient documents — approved local scope

Owner-approved on 1 November 2026: separate administrative documents from the medical dossier, import files and generate documents from blank templates; assistants may contribute. This delivery uses synthetic local records only. It does not activate real clinical practice or patient publication.

## Current upload-library scope (1 November 2026)

The owner's latest request narrows the current interface to file uploads. Category and predefined type are required before file selection. Interactive template authoring, PDF generation, signatures and AI classification are outside this delivery; existing versioned draft records are preserved.

The reusable catalog has fourteen categories. Existing files without a known subtype retain an explicit unspecified type instead of inferring medical content. Optional metadata includes title, document date, notes and a patient-linked appointment. Consultation/treatment entity links remain unavailable until those entities have a real authorized backend model.

The library uses private PDF/JPEG/PNG files (20 MiB each), per-file idempotent import, server-side category/search pagination, preview/download, versioned metadata edits and confirmed soft deletion with audit history. Native STL/DICOM files are not supported. Soft deletion hides access to the file; it is not permanent Storage erasure or a retention policy.

Manager/dentist may edit or remove authorized imported documents; assistant/reception may edit or remove their own imports. Reception remains limited to administrative files. No imported file is automatically clinically validated or published to Patient Pass.

## Role boundaries

Active reception, manager, assistant and dentist memberships may manage administrative documents in their own clinic. The owner additionally authorized managers to import/read medical files on 1 November 2026. Assistants and dentists also may read/import medical documents. Assistants may prepare report drafts; only dentists may write prescription content or validate generated clinical documents. Managers cannot author clinical drafts or validate clinical documents; clinician-generated validated documents remain restricted to dentist/assistant.

The existing patient hub includes financial data and excludes assistant-only accounts. Their patient directory opens a documentary profile using the already-authorized patient identity, without widening hub permissions.

## Document lifecycle

- Imports accept PDF, JPEG and PNG up to 20 MiB. File type and bytes must be verified server-side. The list displays only confirmed private uploads; retrying the same command cannot create duplicates.
- An imported external prescription or radiograph is **stored**, not clinically validated by this application. Adding a file does not update the administrative checklist automatically.
- Blank prescription/report templates belong to a clinic and have immutable versions. No default medication, dosage, diagnosis or protocol is inferred from the example prescription.
- Draft edits create versioned history. Dentist validation freezes the selected content and the verified patient, clinic and validator identity; it is not an electronic signature or automatically applied stamp.
- No document is released to Patient Pass in this delivery. Release, identity verification, retention and production clinical authorization remain explicit future gates.

## Verification required before delivery credit

Native local Supabase Storage/Auth/API/PostgreSQL and browser tests must cover role and tenant isolation, rejected file formats/size, interrupted uploads/retry, immutable draft versions, stale-version conflicts, dentist-only validation, stored-versus-validated labels, download/preview, reload persistence and desktop/mobile layouts. Private document content must not enter application telemetry or persistent browser caches. Update the Build Center only after these checks pass.

## Verified local import delivery

2026-11-01 : import local privé PDF/JPEG/PNG (20 Mio) activé dans Patients > Documents, espaces administratif/médical, catégories filtrées par espace. Gestionnaire, dentiste et assistante importent réellement; réception administrative seulement. 37 assertions pgTAP PASS; tests natifs Storage/API: import, reprise idempotente, octets téléchargés identiques et patient inaccessible refusé pour les trois rôles. Browser: gestionnaire et assistante PASS; cycle dentiste import/brouillon/révision/validation/rechargement PASS à 1440 et 390px. Corrections catégorie médicale et proxy binaire. Migration 20261101001222 appliquée localement uniquement. Evidence .local/qa/patient-documents-pgtap.txt, patient-documents-browser.log (2 rôles PASS), patient-documents-clinician2.log (2 PASS). Pas de publication patient, signature électronique ou activation clinique réelle.

## Verified upload library and patient organization

2026-11-01: separate patient tabs for administrative and medical dossiers; finance grouped into quotes, invoices, payments and installments. Category-first multiple upload, edit, persisted reload, preview and soft archive pass real browser tests at 1440/390px. Native API confirms exact-byte private downloads, retries, CAS, denied foreign-patient/assistant edits and retained Storage bytes after archive. 33 PostgreSQL assertions pass. Evidence: `.local/qa/document-library-pgtap.txt`, `document-library-native-api.log`, `document-library-browser.log`. Migration `20261101012008` is applied locally only.
