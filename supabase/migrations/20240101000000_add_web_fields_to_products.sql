-- Add web-related fields to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS web_price_krw INTEGER,
ADD COLUMN IF NOT EXISTS web_price_usd DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS web_bonus_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS web_display_order INTEGER DEFAULT 999,
ADD COLUMN IF NOT EXISTS web_is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS web_description TEXT;

-- Add constraints to ensure positive prices
ALTER TABLE public.products
ADD CONSTRAINT check_web_price_krw_positive CHECK (web_price_krw IS NULL OR web_price_krw > 0),
ADD CONSTRAINT check_web_price_usd_positive CHECK (web_price_usd IS NULL OR web_price_usd > 0),
ADD CONSTRAINT check_web_bonus_amount_non_negative CHECK (web_bonus_amount IS NULL OR web_bonus_amount >= 0);

-- Add comments for documentation
COMMENT ON COLUMN public.products.web_price_krw IS 'Price in Korean Won for web display';
COMMENT ON COLUMN public.products.web_price_usd IS 'Price in US Dollars for web display';
COMMENT ON COLUMN public.products.web_bonus_amount IS 'Bonus star candy amount offered with the product';
COMMENT ON COLUMN public.products.web_display_order IS 'Display order for web interface (lower numbers appear first)';
COMMENT ON COLUMN public.products.web_is_featured IS 'Flag to mark featured products on web';
COMMENT ON COLUMN public.products.web_description IS 'Detailed product description for web display';

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_products_web_display_order ON public.products(web_display_order);
CREATE INDEX IF NOT EXISTS idx_products_web_is_featured ON public.products(web_is_featured) WHERE web_is_featured = true;

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
    ELSE NULL
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
    ELSE NULL
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
    ELSE 0
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
    ELSE 999
  END,
  web_is_featured = CASE 
    WHEN star_candy = 1000 THEN true
    WHEN star_candy = 5000 THEN true
    ELSE false
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
    ELSE NULL
  END
WHERE product_type = 'consumable' AND star_candy IS NOT NULL;