\set ON_ERROR_STOP on
begin;
do $$ begin
 assert session_user='postgres' and current_user='postgres' and current_database()='fixture';
 assert current_setting('plpgsql.check_asserts')='on';
 assert (select not rolsuper and not rolbypassrls from pg_roles where rolname=current_user);
end $$;
insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
 paypal_client_id,paypal_account_id,paypal_merchant_id) values
 ('d155bb01-0000-4000-8000-000000000002','PAYPAL','SANDBOX',2,'fixture.binding.paypal.v2',
  'binding-client-v2','binding-account-v2','binding-merchant-v2');
update public.web_payment_provider_settings set verification_binding_id='d155bb01-0000-4000-8000-000000000002',
 paypal_account_id='binding-account-v2',paypal_merchant_id='binding-merchant-v2'
where provider='PAYPAL' and environment='SANDBOX';
do $$ begin
 assert (select verification_binding_id='d155bb01-0000-4000-8000-000000000002'::uuid
  and paypal_account_id='binding-account-v2' and paypal_merchant_id='binding-merchant-v2'
  from public.web_payment_provider_settings where provider='PAYPAL' and environment='SANDBOX');
 assert (select count(*)=3 from public.web_payment_verification_bindings);
end $$;
commit;
select 'PROVIDER_RPC_ROTATE_COMPLETE';
