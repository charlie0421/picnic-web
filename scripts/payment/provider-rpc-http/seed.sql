\set ON_ERROR_STOP on
-- Disposable synthetic identities only. No provider credential resolution.
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres';
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
 assert pg_has_role('postgres','wallet_command_owner','MEMBER');
end $$;
insert into auth.users(id,email,created_at,updated_at) values
 ('d155aa01-0000-4000-8000-000000000001','binding-a@example.invalid',now(),now()),
 ('d155aa01-0000-4000-8000-000000000002','binding-b@example.invalid',now(),now()),
 ('d155aa01-0000-4000-8000-000000000003','binding-c@example.invalid',now(),now());
insert into public.user_profiles(id,email,nickname) values
 ('d155aa01-0000-4000-8000-000000000001','binding-a@example.invalid','binding-http-a'),
 ('d155aa01-0000-4000-8000-000000000002','binding-b@example.invalid','binding-http-b'),
 ('d155aa01-0000-4000-8000-000000000003','binding-c@example.invalid','binding-http-c');
insert into public.products(id,product_name,product_type,platform,start_at,end_at,
 star_candy,star_candy_bonus,web_bonus_amount,web_price_usd,web_price_krw)
values('BINDHTTP1','Synthetic binding quote','consumable','Android',null,null,100,999,7,1.23,1700);
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 paypal_client_id,paypal_account_id,paypal_merchant_id) values
 ('d155bb01-0000-4000-8000-000000000001','PAYPAL','SANDBOX',1,'fixture.binding.paypal.v1',
  'binding-client-v1','binding-account-v1','binding-merchant-v1');
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 portone_merchant_id,portone_store_id,portone_channel_id,portone_channel_type) values
 ('d155bb01-0000-4000-8000-000000000003','PORTONE','TEST',1,'fixture.binding.portone.v1',
  'binding-portone-merchant','binding-portone-store','binding-portone-channel','TEST');
update public.web_payment_provider_settings set is_current_environment=false;
insert into public.web_payment_provider_settings(provider,environment,currency) values
 ('PAYPAL','SANDBOX','USD'),('PORTONE','TEST','KRW');
update public.web_payment_provider_settings set is_current_environment=true,mode='OPEN',
 allow_new_orders=true,allow_charge=true,settings_version=31,
 allowed_countries=case when provider='PAYPAL' then array['US'] else array['KR'] end,
 accepted_policy_version='binding-consent',product_policy_version='binding-product',
 bonus_policy_version='binding-bonus',bonus_expiry_policy_version='binding-expiry',
 refund_policy_version='binding-refund',terms_policy_version='binding-terms',
 verification_binding_id=case when provider='PAYPAL' then 'd155bb01-0000-4000-8000-000000000001'::uuid
  else 'd155bb01-0000-4000-8000-000000000003'::uuid end,
 paypal_account_id=case when provider='PAYPAL' then 'binding-account-v1' end,
 paypal_merchant_id=case when provider='PAYPAL' then 'binding-merchant-v1' end,
 portone_merchant_id=case when provider='PORTONE' then 'binding-portone-merchant' end,
 portone_store_id=case when provider='PORTONE' then 'binding-portone-store' end,
 portone_channel_id=case when provider='PORTONE' then 'binding-portone-channel' end,
 portone_channel_type=case when provider='PORTONE' then 'TEST' end
where (provider,environment) in (('PAYPAL','SANDBOX'),('PORTONE','TEST'));
create temp table binding_cases(label text primary key,actor uuid not null,order_id uuid not null unique);
-- Temporary session helper invokes the original commands, never a stub RPC.
create function pg_temp.binding_order(label text,actor uuid,provider text,prepare boolean)
returns uuid language plpgsql as $$
declare r jsonb;o uuid;
begin
 set local role service_role;
 assert current_user='service_role','SEED_SERVICE_ROLE_REQUIRED';
 r:=public.create_web_payment_order(actor,'BINDHTTP1',provider,
  case when provider='PAYPAL' then 'US' else 'KR' end,gen_random_uuid(),'binding-consent');
 o:=(r->>'order_id')::uuid;
 assert o is not null,format('SEED_ORIGINAL_ORDER_FAILED %s %s',label,r);
 if prepare then
  r:=public.prepare_web_payment_provider_context(actor,o);
  assert r->>'outcome'='PREPARED' and r->>'context_id' is not null,
   format('SEED_ORIGINAL_PREPARE_FAILED %s %s',label,r);
 end if;
 reset role;
 assert current_user='postgres';
 return o;
exception when others or assert_failure then reset role;raise;
end $$;
insert into binding_cases values
 ('B1','d155aa01-0000-4000-8000-000000000001',
  pg_temp.binding_order('B1','d155aa01-0000-4000-8000-000000000001','PAYPAL',true)),
 ('B2','d155aa01-0000-4000-8000-000000000001',
  pg_temp.binding_order('B2','d155aa01-0000-4000-8000-000000000001','PAYPAL',false)),
 ('B4','d155aa01-0000-4000-8000-000000000003',
  pg_temp.binding_order('B4','d155aa01-0000-4000-8000-000000000003','PORTONE',true));

-- B3 is INSERT-only historical data. Keep FK/CHECK/internal triggers active.
-- Restore the original USER-trigger modes before any binding RPC observes it.
do $$
declare o public.web_payment_orders%rowtype;q public.web_payment_quotes%rowtype;
 c public.web_payment_provider_contexts%rowtype;before_triggers jsonb;after_triggers jsonb;
begin
 select jsonb_agg(jsonb_build_array(oid,tgenabled) order by oid) into before_triggers from pg_trigger
 where tgrelid in ('public.web_payment_orders'::regclass,'public.web_payment_quotes'::regclass,
  'public.web_payment_provider_contexts'::regclass);
 assert not exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'O'
  and tgrelid in ('public.web_payment_orders'::regclass,'public.web_payment_quotes'::regclass,
   'public.web_payment_provider_contexts'::regclass)),'SEED_INITIAL_TRIGGER_MODE';
 select * into strict o from public.web_payment_orders where id=(select order_id from binding_cases where label='B1');
 select * into strict q from public.web_payment_quotes where id=o.quote_id;
 select * into strict c from public.web_payment_provider_contexts where order_id=o.id;
 o.id:=gen_random_uuid();o.request_id:=gen_random_uuid();
 q.id:=gen_random_uuid();q.order_id:=o.id;o.quote_id:=q.id;
 c.id:=gen_random_uuid();c.create_request_key:=gen_random_uuid();c.order_id:=o.id;c.quote_id:=q.id;
 q.verification_binding_id:=null;c.verification_binding_id:=null;
 q.settings_snapshot:=q.settings_snapshot-'verification_binding_id';
 q.quote:=jsonb_set(q.quote,'{settings_hash}',to_jsonb(
  encode(extensions.digest(convert_to(q.settings_snapshot::text,'UTF8'),'sha256'),'hex')));
 q.quote_hash:=encode(extensions.digest(convert_to(q.quote::text,'UTF8'),'sha256'),'hex');
 o.quote_hash:=q.quote_hash;c.quote_hash:=q.quote_hash;
 set constraints all deferred;
 set local role wallet_command_owner;
 assert current_user='wallet_command_owner';
 alter table public.web_payment_quotes disable trigger user;
 alter table public.web_payment_provider_contexts disable trigger user;
 insert into public.web_payment_orders select (o).*;
 insert into public.web_payment_quotes select (q).*;
 insert into public.web_payment_provider_contexts select (c).*;
 alter table public.web_payment_quotes enable trigger user;
 alter table public.web_payment_provider_contexts enable trigger user;
 reset role;
 set constraints all immediate;
 select jsonb_agg(jsonb_build_array(oid,tgenabled) order by oid) into after_triggers from pg_trigger
 where tgrelid in ('public.web_payment_orders'::regclass,'public.web_payment_quotes'::regclass,
  'public.web_payment_provider_contexts'::regclass);
 assert before_triggers=after_triggers,'SEED_TRIGGER_RESTORE_FAILED';
 assert exists(select 1 from public.web_payment_orders wo join public.web_payment_quotes wq on wq.id=wo.quote_id
  join public.web_payment_provider_contexts wc on wc.order_id=wo.id
  where wo.id=o.id and wq.verification_binding_id is null and wc.verification_binding_id is null
   and not (wq.settings_snapshot ? 'verification_binding_id') and wc.quote_hash=wq.quote_hash
   and wo.quote_hash=wq.quote_hash),'SEED_B3_HISTORY_SETUP_FAILED';
 insert into binding_cases values('B3',o.user_id,o.id);
exception when others or assert_failure then reset role;raise;
end $$;
do $$ begin
 assert (select count(*)=4 from binding_cases),'SEED_CASE_COUNT';
 assert (select count(*)=2 from public.web_payment_provider_settings where is_current_environment
  and mode='OPEN' and allow_charge and allow_new_orders),'SEED_SETTINGS_COUNT';
 assert (select count(*)=0 from public.web_payment_orders where user_id='d155aa01-0000-4000-8000-000000000002');
 assert not exists(select 1 from public.web_payment_charge_attempts);
 assert not exists(select 1 from public.web_payment_observations);
 assert not exists(select 1 from public.web_payment_provider_links);
end $$;
set constraints all immediate;
commit;
select jsonb_build_object('label',label,'actor',actor,'order',order_id) from binding_cases order by label;
select 'PROVIDER_RPC_SEED_COMPLETE';
