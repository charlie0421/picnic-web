-- Update existing consumable products with web pricing data
-- Based on the pricing table provided by the user

UPDATE public.products 
SET 
  web_price_krw = CASE 
    WHEN star_candy = 100 THEN 1400
    WHEN star_candy = 200 THEN 2800
    WHEN star_candy = 600 THEN 8500
    WHEN star_candy = 1000 THEN 14000
    WHEN star_candy = 2000 THEN 28000
    WHEN star_candy = 3000 THEN 42000
    WHEN star_candy = 4000 THEN 55000
    WHEN star_candy = 5000 THEN 69000
    WHEN star_candy = 7000 THEN 95000
    WHEN star_candy = 10000 THEN 130000
    ELSE web_price_krw -- Keep existing value if no match
  END,
  web_price_usd = CASE 
    WHEN star_candy = 100 THEN 0.90
    WHEN star_candy = 200 THEN 1.99
    WHEN star_candy = 600 THEN 5.99
    WHEN star_candy = 1000 THEN 9.99
    WHEN star_candy = 2000 THEN 19.99
    WHEN star_candy = 3000 THEN 29.99
    WHEN star_candy = 4000 THEN 39.99
    WHEN star_candy = 5000 THEN 49.99
    WHEN star_candy = 7000 THEN 69.99
    WHEN star_candy = 10000 THEN 99.99
    ELSE web_price_usd -- Keep existing value if no match
  END,
  web_bonus_amount = CASE 
    WHEN star_candy = 100 THEN 0
    WHEN star_candy = 200 THEN 25
    WHEN star_candy = 600 THEN 85
    WHEN star_candy = 1000 THEN 150
    WHEN star_candy = 2000 THEN 320
    WHEN star_candy = 3000 THEN 540
    WHEN star_candy = 4000 THEN 760
    WHEN star_candy = 5000 THEN 1000
    WHEN star_candy = 7000 THEN 1500
    WHEN star_candy = 10000 THEN 2100
    ELSE COALESCE(web_bonus_amount, 0) -- Keep existing value or default to 0
  END,
  web_display_order = CASE 
    WHEN star_candy = 100 THEN 1
    WHEN star_candy = 200 THEN 2
    WHEN star_candy = 600 THEN 3
    WHEN star_candy = 1000 THEN 4
    WHEN star_candy = 2000 THEN 5
    WHEN star_candy = 3000 THEN 6
    WHEN star_candy = 4000 THEN 7
    WHEN star_candy = 5000 THEN 8
    WHEN star_candy = 7000 THEN 9
    WHEN star_candy = 10000 THEN 10
    ELSE COALESCE(web_display_order, 999) -- Keep existing value or default to 999
  END,
  web_is_featured = CASE 
    WHEN star_candy = 1000 THEN true
    WHEN star_candy = 5000 THEN true
    ELSE COALESCE(web_is_featured, false) -- Keep existing value or default to false
  END,
  web_description = CASE 
    WHEN star_candy = 100 THEN '{"ko": "스타터 패키지", "en": "Starter Package"}'
    WHEN star_candy = 200 THEN '{"ko": "베이직 패키지 + 보너스", "en": "Basic Package + Bonus"}'
    WHEN star_candy = 600 THEN '{"ko": "인기 패키지 + 보너스", "en": "Popular Package + Bonus"}'
    WHEN star_candy = 1000 THEN '{"ko": "추천! 베스트 패키지 + 보너스", "en": "Recommended! Best Package + Bonus"}'
    WHEN star_candy = 2000 THEN '{"ko": "프리미엄 패키지 + 보너스", "en": "Premium Package + Bonus"}'
    WHEN star_candy = 3000 THEN '{"ko": "디럭스 패키지 + 보너스", "en": "Deluxe Package + Bonus"}'
    WHEN star_candy = 4000 THEN '{"ko": "얼티메이트 패키지 + 보너스", "en": "Ultimate Package + Bonus"}'
    WHEN star_candy = 5000 THEN '{"ko": "최고 가치! 메가 패키지 + 보너스", "en": "Best Value! Mega Package + Bonus"}'
    WHEN star_candy = 7000 THEN '{"ko": "슈퍼 패키지 + 보너스", "en": "Super Package + Bonus"}'
    WHEN star_candy = 10000 THEN '{"ko": "마스터 패키지 + 보너스", "en": "Master Package + Bonus"}'
    ELSE web_description -- Keep existing value if no match
  END
WHERE product_type = 'consumable' AND star_candy IS NOT NULL;

-- Verify the update
SELECT 
  id,
  product_name,
  star_candy,
  web_price_krw,
  web_price_usd,
  web_bonus_amount,
  web_display_order,
  web_is_featured,
  web_description
FROM public.products 
WHERE product_type = 'consumable' 
  AND star_candy IS NOT NULL
ORDER BY web_display_order, star_candy; 