\set ON_ERROR_STOP on
-- Disposable synthetic identities for the H1 fixture. No provider credential is stored or resolved.
-- The root replaces __H1_LABELS__ with a validated comma list. One synthetic user owns one order.
-- Native and HTTP fixture quote: 123 minor units / 1.23 USD. Binding scope: account fixture-account-v1,
-- merchant binding-merchant-v1, country US. Orders are created by the original command, never by a stub.
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres','H1_SEED_SESSION';
 assert current_database()='fixture' and current_setting('plpgsql.check_asserts')='on','H1_SEED_DATABASE';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user),'H1_SEED_NON_SUPERUSER';
 assert to_regprocedure('public.open_web_payment_read_cycle(uuid,uuid,text)') is not null,'H1_SEED_CONTRACT_MISSING';
end $$;
insert into public.products(id,product_name,product_type,platform,start_at,end_at,
 star_candy,star_candy_bonus,web_bonus_amount,web_price_usd,web_price_krw)
 values('H1HTTP1','Synthetic H1 product','consumable','Android',null,null,100,999,7,1.23,1700);
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 paypal_client_id,paypal_account_id,paypal_merchant_id) values
 ('c1ca0003-0000-4000-8000-000000000001','PAYPAL','SANDBOX',1,'fixture.h1.paypal',
 'fixture-client-v1','fixture-account-v1','binding-merchant-v1');
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 portone_merchant_id,portone_store_id,portone_channel_id,portone_channel_type) values
 ('c1ca0003-0000-4000-8000-000000000002','PORTONE','TEST',1,'fixture.h1.portone',
 'fixture-portone-merchant','fixture-store','fixture-channel','TEST');
insert into public.web_payment_provider_settings(provider,environment,currency)
 values('PAYPAL','SANDBOX','USD'),('PORTONE','TEST','KRW') on conflict(provider,environment) do nothing;
update public.web_payment_provider_settings set is_current_environment=false;
update public.web_payment_provider_settings set is_current_environment=true,mode='OPEN',allow_new_orders=true,
 allow_charge=true,settings_version=31,
 allowed_countries=case when provider='PAYPAL' then array['US'] else array['KR'] end,
 accepted_policy_version='h1-consent',product_policy_version='product-1',bonus_policy_version='bonus-1',
 bonus_expiry_policy_version='expiry-1',refund_policy_version='refund-1',terms_policy_version='terms-1',
 verification_binding_id=case when provider='PAYPAL' then 'c1ca0003-0000-4000-8000-000000000001'::uuid
   else 'c1ca0003-0000-4000-8000-000000000002'::uuid end,
 paypal_account_id=case when provider='PAYPAL' then 'fixture-account-v1' end,
 paypal_merchant_id=case when provider='PAYPAL' then 'binding-merchant-v1' end,
 portone_merchant_id=case when provider='PORTONE' then 'fixture-portone-merchant' end,
 portone_store_id=case when provider='PORTONE' then 'fixture-store' end,
 portone_channel_id=case when provider='PORTONE' then 'fixture-channel' end,
 portone_channel_type=case when provider='PORTONE' then 'TEST' end
 where (provider,environment) in (('PAYPAL','SANDBOX'),('PORTONE','TEST'));

create temp table h1_cases(label text primary key,actor uuid not null unique,order_id uuid not null unique);
-- Temporary session helper. It invokes the original order command as service_role.
create function pg_temp.h1_order(p_label text,p_actor uuid) returns uuid language plpgsql as $$
declare r jsonb;o uuid;
begin
 set local role service_role;
 assert current_user='service_role','H1_SEED_SERVICE_ROLE_REQUIRED';
 r:=public.create_web_payment_order(p_actor,'H1HTTP1','PAYPAL','US',gen_random_uuid(),'h1-consent');
 o:=(r->>'order_id')::uuid;
 assert o is not null,format('H1_SEED_ORDER_FAILED %s %s',p_label,r);
 reset role;
 assert current_user='postgres';
 return o;
exception when others or assert_failure then reset role;raise;
end $$;
do $$
declare v_label text;v_actor uuid;v_index integer:=0;
begin
 foreach v_label in array string_to_array('__H1_LABELS__',',') loop
  v_index:=v_index+1;
  v_actor:=gen_random_uuid();
  insert into auth.users(id,email,created_at,updated_at)
   values(v_actor,format('h1-user-%s@example.invalid',v_index),now(),now());
  insert into public.user_profiles(id,email,nickname)
   values(v_actor,format('h1-user-%s@example.invalid',v_index),format('h1-http-user-%s',v_index));
  insert into h1_cases values(v_label,v_actor,pg_temp.h1_order(v_label,v_actor));
 end loop;
end $$;
do $$ begin
 assert (select count(*)=cardinality(string_to_array('__H1_LABELS__',',')) from h1_cases),'H1_SEED_CASE_COUNT';
 assert (select count(*)=2 from public.web_payment_provider_settings where is_current_environment
  and mode='OPEN' and allow_charge and allow_new_orders),'H1_SEED_SETTINGS_COUNT';
 assert not exists(select 1 from public.web_payment_charge_attempts),'H1_SEED_ATTEMPTS';
 assert not exists(select 1 from public.web_payment_observations),'H1_SEED_OBSERVATIONS';
 assert not exists(select 1 from public.web_payment_provider_links),'H1_SEED_LINKS';
 assert not exists(select 1 from public.web_payment_submission_classifications),'H1_SEED_CLASSIFICATIONS';
 assert not exists(select 1 from public.web_payment_read_cycles),'H1_SEED_CYCLES';
end $$;
commit;
select jsonb_build_object('label',label,'actor',actor,'order',order_id) from h1_cases order by label;
select 'H1_SEED_COMPLETE';
