-- Synthetic Moroccan clinic shells only. No auth identities/passwords or real patients.
insert into public.clinics(id,name) values
('10000000-0000-4000-8000-000000000001','Cabinet Dentaire Atlas - Casablanca (FICTIF)'),
('10000000-0000-4000-8000-000000000002','Cabinet Sourire de Sale (FICTIF)')
on conflict (id) do update set name = excluded.name;

-- Clearly labelled local-demo resources for staff-confirmed synthetic requests.
insert into private.demo_booking_sample_resources(id,clinic_id,kind,display_name) values
 ('73000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo A'),
 ('73000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','provider','Praticien·ne démo B'),
 ('73000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo A'),
 ('73000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','chair','Fauteuil démo B')
on conflict (id) do update set clinic_id=excluded.clinic_id,kind=excluded.kind,display_name=excluded.display_name,active=true;

-- Fictional directory rows only: stable references and names, no contact or clinical data.
insert into public.patients(id,clinic_id,reference,display_name) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ATLAS-DEMO-001','Salma Alaoui (FICTIF)'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','ATLAS-DEMO-002','Youssef Benali (FICTIF)'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','ATLAS-DEMO-003','Imane El Idrissi (FICTIF)'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','SALE-DEMO-001','Nadia El Fassi (FICTIF)'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','SALE-DEMO-002','Hamza Chraibi (FICTIF)'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','SALE-DEMO-003','Oumaima Berrada (FICTIF)')
on conflict (clinic_id,reference) do update set id=excluded.id,display_name=excluded.display_name;

-- Synthetic fake-provider conversation routing only; no person/contact is stored.
insert into private.demo_fake_conversations(conversation_ref,clinic_id) values
 ('DEMO-CHAT-001','10000000-0000-4000-8000-000000000001'),
 ('DEMO-CHAT-002','10000000-0000-4000-8000-000000000001'),
 ('DEMO-CHAT-003','10000000-0000-4000-8000-000000000002'),
 ('DEMO-CHAT-004','10000000-0000-4000-8000-000000000002')
on conflict (conversation_ref) do nothing;
