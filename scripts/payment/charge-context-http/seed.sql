\set ON_ERROR_STOP on
-- Disposable API fixtures. postgres retains the original owner memberships.
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on';
end $$;
insert into auth.users(id,email,created_at,updated_at) values
 ('c755aa01-0000-4000-8000-000000000001','context-a@example.invalid',now(),now()),
 ('c755aa01-0000-4000-8000-000000000002','context-b@example.invalid',now(),now()),
 ('c755aa01-0000-4000-8000-000000000003','context-c@example.invalid',now(),now());
insert into public.user_profiles(id,email,nickname) values
 ('c755aa01-0000-4000-8000-000000000001','context-a@example.invalid','context-http-a'),
 ('c755aa01-0000-4000-8000-000000000002','context-b@example.invalid','context-http-b'),
 ('c755aa01-0000-4000-8000-000000000003','context-c@example.invalid','context-http-c');
insert into public.products(id,product_name,product_type,platform,start_at,end_at,
 star_candy,star_candy_bonus,web_bonus_amount,web_price_usd,web_price_krw) values
 ('CTXHTTP1','Synthetic getter quote','consumable','Android',null,null,100,999,7,1.23,1700),
 ('CTXHTTP2','Synthetic source numeric boundary','consumable','Android',null,null,100,999,7,99999999.99,2147483647);
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 paypal_client_id,paypal_account_id,paypal_merchant_id) values
 ('c755aa02-0000-4000-8000-000000000001','PAYPAL','SANDBOX',1,'public.context.paypal','ctx-client','ctx-account','ctx-merchant'),
 ('c755aa02-0000-4000-8000-000000000002','PAYPAL','SANDBOX',2,'public.context.paypal','ctx-client-rotated','ctx-account-rotated','ctx-merchant-rotated');
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 portone_merchant_id,portone_store_id,portone_channel_id,portone_channel_type) values
 ('c755aa02-0000-4000-8000-000000000003','PORTONE','TEST',1,'public.context.portone','ctx-pg-merchant','ctx-store','ctx-channel','TEST'),
 ('c755aa02-0000-4000-8000-000000000004','PORTONE','TEST',2,'public.context.portone','ctx-pg-rotated','ctx-store-rotated','ctx-channel-rotated','TEST');
-- The original migration seeds LIVE only. Insert both test environments.
update public.web_payment_provider_settings set is_current_environment=false;
insert into public.web_payment_provider_settings(provider,environment,currency) values
 ('PAYPAL','SANDBOX','USD'),('PORTONE','TEST','KRW');
update public.web_payment_provider_settings set is_current_environment=true,mode='OPEN',
 allow_new_orders=true,allow_charge=true,settings_version=22,
 allowed_countries=case when provider='PAYPAL' then array['US'] else array['KR'] end,
 accepted_policy_version='ctx-consent',product_policy_version='ctx-product',bonus_policy_version='ctx-bonus',
 bonus_expiry_policy_version='ctx-expiry',refund_policy_version='ctx-refund',terms_policy_version='ctx-terms',
 verification_binding_id=case when provider='PAYPAL' then 'c755aa02-0000-4000-8000-000000000001'::uuid
  else 'c755aa02-0000-4000-8000-000000000003'::uuid end,
 paypal_account_id=case when provider='PAYPAL' then 'ctx-account' end,
 paypal_merchant_id=case when provider='PAYPAL' then 'ctx-merchant' end,
 portone_merchant_id=case when provider='PORTONE' then 'ctx-pg-merchant' end,
 portone_store_id=case when provider='PORTONE' then 'ctx-store' end,
 portone_channel_id=case when provider='PORTONE' then 'ctx-channel' end,
 portone_channel_type=case when provider='PORTONE' then 'TEST' end
where (provider,environment) in (('PAYPAL','SANDBOX'),('PORTONE','TEST'));
do $$ begin
 assert (select count(*)=2 from public.web_payment_provider_settings where is_current_environment);
 assert (select count(*)=2 from public.web_payment_provider_settings
  where is_current_environment and mode='OPEN' and allow_charge and allow_new_orders);
end $$;

-- Temporary utilities exist only in this pre-REST session, never as product RPCs.
create function pg_temp.context_case(label text,actor uuid,product text,provider text,
 prepare boolean,link boolean,claim boolean,intent boolean,capture boolean,review text)
returns jsonb language plpgsql as $$
declare r jsonb;o uuid;c public.web_payment_provider_contexts%rowtype;
 q public.web_payment_quotes%rowtype;e jsonb;lease jsonb;context_arg uuid;
begin
 set local role service_role;
 assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
 r:=public.create_web_payment_order(actor,product,provider,
  case when provider='PAYPAL' then 'US' else 'KR' end,gen_random_uuid(),'ctx-consent');
 reset role;
 o:=(r->>'order_id')::uuid;
 assert o is not null,format('SEED_ORDER_FAILED %s %s',label,r);
 if prepare then
  set local role service_role;
  assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
  r:=public.prepare_web_payment_provider_context(actor,o);
  reset role;
  select * into strict c from public.web_payment_provider_contexts where id=(r->>'context_id')::uuid;
  select * into strict q from public.web_payment_quotes where id=c.quote_id;
  e:=jsonb_build_object('source','LOOKUP','key',gen_random_uuid()::text,'payload_hash',repeat('a',64),
   'provider',c.provider,'environment',c.environment,'identity_kind',case when provider='PAYPAL' then 'ORDER' else 'PAYMENT' end,
   'external_id',case when provider='PAYPAL' then 'CTX-ORDER-'||c.id::text else c.payment_id end,
   'parent_external_id',null,'order_id',o::text,'user_id',actor::text,'quote_hash',q.quote_hash,
   'order_reference','v2:'||o::text,'scope',c.scope,'amount_minor',q.amount_minor::text,'currency',q.currency,
   'status',case when provider='PAYPAL' then 'CREATED' else 'READY' end,'provider_completed_at',null);
  if link then
   set local role service_role;
   assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
   r:=public.bind_web_payment_provider_identity(c.id,e);
   reset role;
   assert r->>'outcome'='RECORDED',format('SEED_BIND_FAILED %s %s',label,r);
  end if;
 end if;
 if claim then
  set local role service_role;
  assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
  lease:=public.claim_web_payment_charge(actor,o,1,case when provider='PAYPAL' then 'CAPTURE' else 'CONFIRM' end);
  reset role;
  assert lease->>'decision'='SUBMIT',format('SEED_CLAIM_FAILED %s %s',label,lease);
 end if;
 if intent then
  set local role service_role;
  assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
  r:=public.record_web_payment_submission_intent(actor,o,(lease->>'row_version')::bigint,
   case when provider='PAYPAL' then 'CAPTURE' else 'CONFIRM' end,
   (lease->>'attempt_id')::uuid,(lease->>'lease_token')::uuid,(lease->>'fencing_version')::bigint);
  reset role;
  assert r->>'decision'='SUBMIT' and r->>'safe_reason_code'='INTENT_RECORDED',format('SEED_INTENT_FAILED %s %s',label,r);
 end if;
 if capture then
  e:=e||jsonb_build_object('key',gen_random_uuid()::text,'identity_kind','CAPTURE',
   'external_id','CTX-CAPTURE-'||c.id::text,'parent_external_id',e->>'external_id','status','COMPLETED');
  set local role service_role;
  assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
  r:=public.bind_web_payment_provider_identity(c.id,e);
  reset role;
  assert r->>'outcome'='RECORDED',format('SEED_CAPTURE_BIND_FAILED %s %s',label,r);
 end if;
 if review is not null then
  e:=e||jsonb_build_object('key',gen_random_uuid()::text);
  context_arg:=c.id;
  if review='linked' then e:=e||'{"amount_minor":"999"}'::jsonb;
  elsif review='unlinked' then context_arg:=gen_random_uuid();
  else raise exception 'SEED_REVIEW_CASE_INVALID';end if;
  set local role service_role;
  assert current_user='service_role','SEED_SERVICE_ROLE_NOT_ESTABLISHED';
  r:=public.record_web_payment_observation(context_arg,e);
  reset role;
  assert r->>'outcome'='REVIEW_REQUIRED',format('SEED_REVIEW_FAILED %s %s',label,r);
 end if;
 assert current_user='postgres';
 return jsonb_build_object('label',label,'actor',actor,'order',o);
end $$;
select pg_temp.context_case('F1','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',false,false,false,false,false,null);
select pg_temp.context_case('F2','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,false,false,false,null);
select pg_temp.context_case('F3','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,true,false,false,null);
select pg_temp.context_case('F4','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,true,true,false,null);
select pg_temp.context_case('F5','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,true,true,true,null);
select pg_temp.context_case('F6','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,false,false,false,'linked');
select pg_temp.context_case('F7','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PAYPAL',true,true,false,false,false,'unlinked');
select pg_temp.context_case('F8','c755aa01-0000-4000-8000-000000000001','CTXHTTP1','PORTONE',true,false,false,false,false,null);
select pg_temp.context_case('F9','c755aa01-0000-4000-8000-000000000003','CTXHTTP1','PAYPAL',true,true,true,true,false,null);
select pg_temp.context_case('F10','c755aa01-0000-4000-8000-000000000001','CTXHTTP2','PAYPAL',false,false,false,false,false,null);
select pg_temp.context_case('F11','c755aa01-0000-4000-8000-000000000001','CTXHTTP2','PORTONE',false,false,false,false,false,null);
set constraints all immediate;
commit;
select 'CHARGE_CONTEXT_SEED_COMPLETE';
