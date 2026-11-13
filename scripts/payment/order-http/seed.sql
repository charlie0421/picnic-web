-- Disposable selected-source fixture only. No guard or ACL is disabled.
begin;
insert into auth.users(id,email,created_at,updated_at) values
 ('a733bb01-0000-4000-8000-000000000001','http-a@example.invalid',now(),now()),
 ('a733bb01-0000-4000-8000-000000000002','http-b@example.invalid',now(),now()),
 ('a733bb01-0000-4000-8000-000000000003','http-deleted@example.invalid',now(),now());
insert into public.user_profiles(id,email,nickname,deleted_at) values
 ('a733bb01-0000-4000-8000-000000000001','http-a@example.invalid','order-http-a',null),
 ('a733bb01-0000-4000-8000-000000000002','http-b@example.invalid','order-http-b',null),
 ('a733bb01-0000-4000-8000-000000000003','http-deleted@example.invalid','order-http-deleted',now());
insert into public.products(id,product_name,product_type,platform,start_at,end_at,star_candy,star_candy_bonus,web_bonus_amount,web_price_usd,web_price_krw) values
 ('HTTPP1','HTTP fixed quote','consumable','Android',now()-interval '1 day',now()+interval '1 day',100,999,7,1.23,1700),
 ('HTTPP2','HTTP ended product','consumable','Android',null,now()-interval '1 day',200,999,14,2.34,3200),
 ('HTTPP3','HTTP source numeric maximum','consumable','Android',null,null,2147483647,999,2147483647,99999999.99,2147483647);
-- Fixture-only privileged settings; policies are synthetic, not published terms.
update public.web_payment_provider_settings set is_current_environment=false;
insert into public.web_payment_provider_settings(provider,environment,currency,is_current_environment,mode,allow_new_orders,allow_charge,
 allowed_countries,settings_version,accepted_policy_version,product_policy_version,bonus_policy_version,
 bonus_expiry_policy_version,refund_policy_version,terms_policy_version) values
 ('PAYPAL','SANDBOX','USD',true,'OPEN',true,false,array['US','JP'],2,'fixture-consent-1','fixture-product-1',
  'fixture-bonus-1','fixture-expiry-1','fixture-refund-1','fixture-terms-1'),
 ('PORTONE','TEST','KRW',true,'CLOSED',false,false,array['KR'],2,'fixture-consent-1','fixture-product-1',
  'fixture-bonus-1','fixture-expiry-1','fixture-refund-1','fixture-terms-1');
-- current7 binding registry INSERT derives its hash in the original trigger.
-- The diagnostic orders-only mode has no binding table and cannot be final GREEN.
do $$ begin
 if to_regclass('public.web_payment_verification_bindings') is not null then
  insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
   paypal_client_id,paypal_account_id,paypal_merchant_id) values
   ('a733bb06-0000-4000-8000-000000000001','PAYPAL','SANDBOX',1,'publicHttpFixture','fixture-client','fixture-account','fixture-merchant');
  update public.web_payment_provider_settings set verification_binding_id='a733bb06-0000-4000-8000-000000000001',
   paypal_account_id='fixture-account',paypal_merchant_id='fixture-merchant' where provider='PAYPAL' and environment='SANDBOX';
  insert into public.web_payment_verification_bindings(id,provider,environment,binding_version,credential_ref,
   portone_merchant_id,portone_store_id,portone_channel_id,portone_channel_type) values
   ('a733bb06-0000-4000-8000-000000000002','PORTONE','TEST',1,'publicHttpFixturePortone',
    'fixture-pg-merchant','fixture-store','fixture-channel','TEST');
  update public.web_payment_provider_settings set verification_binding_id='a733bb06-0000-4000-8000-000000000002',
   portone_merchant_id='fixture-pg-merchant',portone_store_id='fixture-store',portone_channel_id='fixture-channel',portone_channel_type='TEST'
   where provider='PORTONE' and environment='TEST';
 end if;
end $$;
-- Construct an immutable historical INSERT from a real source RPC quote.
-- The seed's live order has a separate request ID and is counted by observers.
set local role service_role;
select public.create_web_payment_order('a733bb01-0000-4000-8000-000000000001','HTTPP1','PAYPAL','US',
 'a733bb02-0000-4000-8000-000000000090','fixture-consent-1');
reset role;
do $$ declare o public.web_payment_orders%rowtype;q public.web_payment_quotes%rowtype;
 document jsonb; h text; issued timestamptz:='2000-01-01T00:00:00.123456Z';
begin
 select * into strict o from public.web_payment_orders where request_id='a733bb02-0000-4000-8000-000000000090';
 select * into strict q from public.web_payment_quotes where id=o.quote_id;
 document:=q.quote||jsonb_build_object('issued_at',issued,'expires_at',issued+interval '15 minutes');
 h:=encode(extensions.digest(convert_to(document::text,'UTF8'),'sha256'),'hex');
 insert into public.web_payment_orders(id,user_id,product_id,provider,environment,billing_country,request_id,request_hash,
 quote_id,quote_hash,settings_version,accepted_policy_version,created_at) values
 ('a733bb04-0000-4000-8000-000000000004',o.user_id,o.product_id,o.provider,o.environment,o.billing_country,
 'a733bb02-0000-4000-8000-000000000004',o.request_hash,'a733bb05-0000-4000-8000-000000000004',h,o.settings_version,o.accepted_policy_version,issued);
 insert into public.web_payment_quotes(id,order_id,issued_at,expires_at,amount_minor,currency,base_star,product_bonus,quote,settings_snapshot,quote_hash)
 values('a733bb05-0000-4000-8000-000000000004','a733bb04-0000-4000-8000-000000000004',issued,issued+interval '15 minutes',
 q.amount_minor,q.currency,q.base_star,q.product_bonus,document,q.settings_snapshot,h);
end $$;
set constraints all immediate;
commit;
select 'order-http-seed-complete';
