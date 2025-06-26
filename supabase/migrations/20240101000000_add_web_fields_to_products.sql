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