\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
-- Comptes : admin DGREH, agent DGREH, intrus d'une autre organisation
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','admin@test.bf'),
 ('22222222-2222-2222-2222-222222222222','agent@test.bf'),
 ('33333333-3333-3333-3333-333333333333','autre@test.bf');
select siga_bootstrap_admin('admin@test.bf');
insert into siga_profiles(user_id,tenant,email) values ('33333333-3333-3333-3333-333333333333','AUTRE','autre@test.bf');

create or replace function pg_temp.ok(c boolean, lbl text) returns text language sql as
$$ select case when c then 'OK   ' else 'ECHEC' end || ' ' || lbl $$;

-- ---------- En tant qu'administrateur ----------
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',false);
select pg_temp.ok(siga_my_tenant()='DGREH','tenant de l''admin = DGREH');
select pg_temp.ok(siga_link_user('agent@test.bf','203299L')='Compte rattaché','rattachement agent par l''admin');

insert into siga_records(tenant,collection,id,data) values
 ('DGREH','mail','m1','{"num":"{{N:ARRIVEE:2026:aa1}}","ref":"{{N:ARRIVEE:2026:aa1}}/DGREH"}'),
 ('DGREH','mail','m2','{"num":"{{N:ARRIVEE:2026:bb2}}"}'),
 ('DGREH','requests','r1','{"num":"{{N:DMD:2026:cc3}}"}');
select pg_temp.ok((select data->>'num' from siga_records where id='m1')='0001','1er courrier arrivée = 0001');
select pg_temp.ok((select data->>'ref' from siga_records where id='m1')='0001/DGREH','même jeton, même numéro dans le dossier');
select pg_temp.ok((select data->>'num' from siga_records where id='m2')='0002','2e courrier arrivée = 0002');
select pg_temp.ok((select data->>'num' from siga_records where id='r1')='000001','compteur DMD séparé, largeur 6');
-- rejouer le même jeton (synchronisation répétée) : pas de nouveau numéro
insert into siga_records(tenant,collection,id,data) values ('DGREH','mail','m1b','{"num":"{{N:ARRIVEE:2026:aa1}}"}');
select pg_temp.ok((select data->>'num' from siga_records where id='m1b')='0001','jeton rejoué = même numéro');
update siga_records set data='{"num":"{{N:ARRIVEE:2026:dd4}}","_rev":1}' where id='m2';
select pg_temp.ok((select (data->>'_rev')::int from siga_records where id='m2')=2,'version incrémentée par le serveur');
do $x$ begin update siga_records set data='{"num":"x","_rev":1}' where id='m2'; raise exception 'pas bloqué'; exception when sqlstate 'PT409' then null; end $x$;
select pg_temp.ok((select data->>'num' from siga_records where id='m2')='0003','modification sur version périmée refusée (conflit)');
insert into siga_records(tenant,collection,id,data) values ('DGREH','mail','m1','{"num":"autre"}');
select pg_temp.ok((select data->>'num' from siga_records where id='m1')='0001','renvoi d''un dossier existant ignoré');
select pg_temp.ok((select count(*) from siga_counters_peek() where key='ARRIVEE' and last_value=3)=1,'compteur lisible par siga_counters_peek');
select pg_temp.ok((select data->>'num' from siga_records where id='m2')='0003','nouveau jeton sur mise à jour = 0003');

-- audit
insert into siga_records(tenant,collection,id,data) values
 ('DGREH','audit','a1','{"at":"2026-09-24T08:00:00Z","actor":"203299L","action":"CREATE","target":"m1","detail":"x"}'),
 ('DGREH','audit','a2','{"at":"2026-09-24T08:01:00Z","actor":"203299L","action":"SEND","target":"m1","detail":"y"}');
select pg_temp.ok((select (data->>'seq')::int from siga_records where id='a2')=2,'audit : seq attribué par le serveur');
select pg_temp.ok((select data->>'prev' from siga_records where id='a2')=(select data->>'hash' from siga_records where id='a1'),'audit : chaînage prev = hash précédent');
select pg_temp.ok(siga_verify_audit() is null,'audit : chaîne intègre');
update siga_records set data='{"at":"x","actor":"pirate","action":"DELETE"}' where id='a1';
select pg_temp.ok((select data->>'actor' from siga_records where id='a1')='203299L','audit : modification ignorée');
select pg_temp.ok(siga_verify_audit() is null,'audit : chaîne toujours intègre');
-- insertion d'audit qui tente d'imposer son seq/hash
insert into siga_records(tenant,collection,id,data) values ('DGREH','audit','a2','{"at":"t","actor":"a","action":"REPLAY"}');
select pg_temp.ok((select data->>'action' from siga_records where id='a2')='SEND' and siga_verify_audit() is null,'audit renvoyé : ignoré, chaîne intacte');
insert into siga_records(tenant,collection,id,data) values ('DGREH','audit','a3','{"at":"t","actor":"a","action":"X","target":"","detail":"","seq":99,"hash":"faux"}');
select pg_temp.ok((select (data->>'seq')::int from siga_records where id='a3')=3,'audit : seq imposé par le client écrasé');
select pg_temp.ok(siga_verify_audit() is null,'audit : chaîne intègre après a3');
-- suppression interdite
do $x$ begin delete from siga_records where id='m1'; raise exception 'pas bloqué'; exception when insufficient_privilege then null; end $x$;
select pg_temp.ok(exists(select 1 from siga_records where id='m1'),'suppression refusée');

-- ---------- En tant qu'agent ----------
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222"}',false);
select pg_temp.ok((select count(*) from siga_records)=7,'agent voit les dossiers de son organisation');
select pg_temp.ok((select agent_mat from siga_profiles where user_id=auth.uid())='203299L','profil agent rattaché');
select pg_temp.ok((select count(*) from siga_profiles)=1,'agent ne voit que son profil');
do $x$ begin perform siga_link_user('autre@test.bf','X'); raise exception 'pas bloqué'; exception when others then if sqlerrm like 'Réservé%' then null; else raise; end if; end $x$;
select pg_temp.ok(true,'agent ne peut pas rattacher de compte');
do $x$ begin perform siga_reset_test_data(); raise exception 'pas bloqué'; exception when others then if sqlerrm like 'Réservé%' then null; else raise; end if; end $x$;
select pg_temp.ok(true,'agent ne peut pas vider la base');
do $x$ begin insert into siga_counters values ('DGREH','ARRIVEE',2026,0); raise exception 'pas bloqué'; exception when insufficient_privilege then null; end $x$;
select pg_temp.ok(true,'compteurs inaccessibles en direct');
do $x$ begin perform siga_resolve_tokens('DGREH','{"a":"{{N:OM:2026:zz9}}"}'); raise exception 'pas bloqué'; exception when insufficient_privilege then null; end $x$;
select pg_temp.ok(true,'attribution de numéro impossible hors enregistrement d''un dossier');

-- ---------- Autre organisation ----------
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333"}',false);
select pg_temp.ok((select count(*) from siga_records)=0,'autre organisation : aucun dossier DGREH visible');
do $x$ begin insert into siga_records(tenant,collection,id,data) values ('DGREH','mail','z','{}'); raise exception 'pas bloqué'; exception when insufficient_privilege then null; end $x$;
select pg_temp.ok(true,'autre organisation : écriture dans DGREH refusée');
insert into siga_records(tenant,collection,id,data) values ('AUTRE','mail','z1','{"num":"{{N:ARRIVEE:2026:ee5}}"}');
select pg_temp.ok((select data->>'num' from siga_records where id='z1')='0001','numérotation indépendante par organisation');
update siga_records set data='{"_rev":2}' where tenant='DGREH';
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',false);
select pg_temp.ok((select data->>'num' from siga_records where id='m2')='0003','mise à jour inter-organisation sans effet');

-- ---------- Anonyme ----------
reset role; set role anon;
do $x$ begin perform count(*) from siga_records; raise exception 'pas bloqué'; exception when insufficient_privilege then null; end $x$;
select 'OK    anonyme : aucun accès';

-- ---------- Reset admin ----------
reset role; set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',false);
select siga_reset_test_data();
insert into siga_records(tenant,collection,id,data) values ('DGREH','mail','n1','{"num":"{{N:ARRIVEE:2026:ff6}}"}');
select pg_temp.ok((select data->>'num' from siga_records where id='n1')='0001','après remise à zéro : numérotation repart à 0001');
select pg_temp.ok((select count(*) from siga_records where tenant='AUTRE')=0,'remise à zéro limitée à son organisation (invisible ici)');
reset role;
select pg_temp.ok((select count(*) from siga_records where tenant='AUTRE')=1,'dossiers de l''autre organisation intacts');
