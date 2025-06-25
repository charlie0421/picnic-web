-- =====================================================================================
-- DATABASE SCHEMA EXTENSIONS FOR PAYMENT FEATURE
-- =====================================================================================
-- Generated on: 2025-06-25
-- Compatible with: Payment types defined in components/client/vote/dialogs/payment/types.ts
--
-- This file contains the SQL migration scripts to extend the existing database schema
-- to support the new payment functionality with Port One (Korea) and PayPal (Global)
-- =====================================================================================

-- =====================================================================================
-- 1. RECEIPT TABLE EXTENSIONS
-- =====================================================================================

-- Add new columns to existing receipts table
ALTER TABLE receipts 
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) CHECK (payment_provider IN ('portone', 'paypal')),
ADD COLUMN IF NOT EXISTS region VARCHAR(10) CHECK (region IN ('korea', 'global')),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2), -- Support large amounts with 2 decimal places
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) CHECK (currency IN ('KRW', 'USD', 'EUR', 'GBP', 'JPY')),
ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fees DECIMAL(10,2), -- Payment processing fees
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) CHECK (payment_status IN ('idle', 'pending', 'processing', 'completed', 'failed', 'cancelled')),
ADD COLUMN IF NOT EXISTS payment_details JSONB; -- Additional payment-specific data

-- Add comments for documentation
COMMENT ON COLUMN receipts.payment_provider IS 'Payment service provider: portone for Korea, paypal for global';
COMMENT ON COLUMN receipts.region IS 'Payment region: korea for Korean users, global for international';
COMMENT ON COLUMN receipts.payment_method IS 'Specific payment method used (card, bank_transfer, easy_pay, mobile, etc)';
COMMENT ON COLUMN receipts.amount IS 'Payment amount in the specified currency';
COMMENT ON COLUMN receipts.currency IS 'Currency code (KRW, USD, EUR, GBP, JPY)';
COMMENT ON COLUMN receipts.transaction_id IS 'External transaction ID from payment provider';
COMMENT ON COLUMN receipts.processed_at IS 'Timestamp when payment was successfully processed';
COMMENT ON COLUMN receipts.fees IS 'Payment processing fees charged';
COMMENT ON COLUMN receipts.payment_status IS 'Current status of the payment transaction';
COMMENT ON COLUMN receipts.payment_details IS 'Additional payment metadata and provider-specific data';

-- =====================================================================================
-- 2. PAYMENT SESSIONS TABLE
-- =====================================================================================

-- Create new payment_sessions table for managing active payment sessions
CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Payment configuration
  payment_provider VARCHAR(20) NOT NULL CHECK (payment_provider IN ('portone', 'paypal')),
  region VARCHAR(10) NOT NULL CHECK (region IN ('korea', 'global')),
  payment_method VARCHAR(50), -- Selected payment method (nullable until selected)
  
  -- Product and pricing information
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(20) CHECK (product_category IN ('stars', 'bonus', 'premium')),
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  
  -- Financial information
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('KRW', 'USD', 'EUR', 'GBP', 'JPY')),
  fees DECIMAL(10,2) DEFAULT 0,
  fixed_fees DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount > 0),
  
  -- Session management
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Metadata and tracking
  metadata JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address INET,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_expiration CHECK (expires_at > created_at),
  CONSTRAINT valid_total CHECK (total_amount = amount + fees + fixed_fees + tax_amount - discount_amount)
);

-- Add table comments
COMMENT ON TABLE payment_sessions IS 'Active payment sessions for tracking payment flow';
COMMENT ON COLUMN payment_sessions.session_token IS 'Unique token for identifying payment session';
COMMENT ON COLUMN payment_sessions.payment_provider IS 'Payment service provider (portone/paypal)';
COMMENT ON COLUMN payment_sessions.region IS 'Payment region (korea/global)';
COMMENT ON COLUMN payment_sessions.product_id IS 'Reference to the product being purchased';
COMMENT ON COLUMN payment_sessions.metadata IS 'Additional session data and configuration';
COMMENT ON COLUMN payment_sessions.total_amount IS 'Final amount to be charged including all fees and taxes';

-- =====================================================================================
-- 3. PAYMENT METHODS CONFIGURATION TABLE
-- =====================================================================================

-- Create table for payment method configurations
CREATE TABLE IF NOT EXISTS payment_methods (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('portone', 'paypal')),
  region VARCHAR(10) NOT NULL CHECK (region IN ('korea', 'global')),
  
  -- Method configuration
  base_fee_percentage DECIMAL(5,2) DEFAULT 0 CHECK (base_fee_percentage >= 0),
  fixed_fee DECIMAL(10,2) DEFAULT 0 CHECK (fixed_fee >= 0),
  min_amount DECIMAL(12,2),
  max_amount DECIMAL(12,2),
  
  -- Supported currencies (JSON array)
  supported_currencies JSONB NOT NULL DEFAULT '[]',
  
  -- Method properties
  processing_time VARCHAR(50), -- e.g., "즉시", "1-3분", "즉시-24시간"
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  -- Additional configuration
  config JSONB DEFAULT '{}', -- Provider-specific configuration
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_fee_range CHECK (base_fee_percentage <= 10), -- Max 10% fee
  CONSTRAINT valid_amount_range CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
);

-- Add table comments
COMMENT ON TABLE payment_methods IS 'Configuration for available payment methods per region and provider';
COMMENT ON COLUMN payment_methods.supported_currencies IS 'JSON array of supported currency codes';
COMMENT ON COLUMN payment_methods.config IS 'Provider-specific configuration and settings';

-- =====================================================================================
-- 4. INDEXES FOR PERFORMANCE
-- =====================================================================================

-- Indexes for receipts table
CREATE INDEX IF NOT EXISTS idx_receipts_user_payment_provider 
  ON receipts(user_id, payment_provider) 
  WHERE payment_provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id 
  ON receipts(transaction_id) 
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_processed_at 
  ON receipts(processed_at) 
  WHERE processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_payment_status 
  ON receipts(payment_status) 
  WHERE payment_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_region_currency 
  ON receipts(region, currency) 
  WHERE region IS NOT NULL AND currency IS NOT NULL;

-- Indexes for payment_sessions table
CREATE INDEX IF NOT EXISTS idx_payment_sessions_user_id 
  ON payment_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_status 
  ON payment_sessions(status);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires_at 
  ON payment_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_session_token 
  ON payment_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_created_at 
  ON payment_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_provider_region 
  ON payment_sessions(payment_provider, region);

-- Indexes for payment_methods table
CREATE INDEX IF NOT EXISTS idx_payment_methods_provider_region 
  ON payment_methods(provider, region);

CREATE INDEX IF NOT EXISTS idx_payment_methods_active 
  ON payment_methods(is_active, sort_order) 
  WHERE is_active = true;

-- =====================================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================================

-- Enable RLS on payment_sessions table
ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own payment sessions
CREATE POLICY payment_sessions_user_access ON payment_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Service role can access all sessions (for admin/monitoring)
CREATE POLICY payment_sessions_service_access ON payment_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- Enable RLS on payment_methods table  
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read payment methods
CREATE POLICY payment_methods_read_access ON payment_methods
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify payment methods
CREATE POLICY payment_methods_service_access ON payment_methods
  FOR ALL USING (auth.role() = 'service_role');

-- Update existing receipts RLS if needed (may already exist)
-- Users can only see their own receipts
DROP POLICY IF EXISTS receipts_user_select ON receipts;
CREATE POLICY receipts_user_select ON receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own receipts
DROP POLICY IF EXISTS receipts_user_insert ON receipts;
CREATE POLICY receipts_user_insert ON receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own receipts (for status updates)
DROP POLICY IF EXISTS receipts_user_update ON receipts;
CREATE POLICY receipts_user_update ON receipts
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================================================
-- 6. FOREIGN KEY CONSTRAINTS
-- =====================================================================================

-- Add foreign key constraint for product reference in payment_sessions
-- Note: This assumes products table exists and uses string IDs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE payment_sessions 
        ADD CONSTRAINT fk_payment_sessions_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) 
        ON DELETE RESTRICT;
    END IF;
END $$;

-- =====================================================================================
-- 7. TRIGGERS FOR AUDIT TRAILS
-- =====================================================================================

-- Update trigger for payment_sessions updated_at
CREATE OR REPLACE FUNCTION update_payment_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_sessions_updated_at_trigger
    BEFORE UPDATE ON payment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_sessions_updated_at();

-- Update trigger for payment_methods updated_at
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_methods_updated_at_trigger
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_methods_updated_at();

-- =====================================================================================
-- 8. INITIAL DATA SEEDING
-- =====================================================================================

-- Insert default payment methods for Korea (Port One)
INSERT INTO payment_methods (id, name, provider, region, base_fee_percentage, fixed_fee, min_amount, max_amount, supported_currencies, processing_time, sort_order) VALUES
('kr_card', '카드결제', 'portone', 'korea', 2.9, 0, 1000, 10000000, '["KRW"]', '즉시', 1),
('kr_bank_transfer', '계좌이체', 'portone', 'korea', 1.5, 300, 1000, 50000000, '["KRW"]', '즉시-5분', 2),
('kr_easy_pay', '간편결제', 'portone', 'korea', 3.3, 0, 1000, 3000000, '["KRW"]', '즉시', 3),
('kr_mobile', '휴대폰결제', 'portone', 'korea', 3.9, 0, 1000, 300000, '["KRW"]', '즉시', 4)
ON CONFLICT (id) DO NOTHING;

-- Insert default payment methods for Global (PayPal)
INSERT INTO payment_methods (id, name, provider, region, base_fee_percentage, fixed_fee, min_amount, max_amount, supported_currencies, processing_time, sort_order) VALUES
('gl_paypal', 'PayPal', 'paypal', 'global', 3.4, 0, 1, 10000, '["USD", "EUR", "GBP", "JPY"]', '즉시', 1),
('gl_credit_card', 'Credit Card', 'paypal', 'global', 2.9, 0.30, 1, 25000, '["USD", "EUR", "GBP"]', '즉시-24시간', 2),
('gl_debit_card', 'Debit Card', 'paypal', 'global', 1.9, 0.30, 1, 5000, '["USD", "EUR"]', '즉시', 3)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- 9. UTILITY FUNCTIONS
-- =====================================================================================

-- Function to clean up expired payment sessions
CREATE OR REPLACE FUNCTION cleanup_expired_payment_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM payment_sessions 
    WHERE expires_at < NOW() 
    AND status IN ('pending', 'processing');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get payment method configuration
CREATE OR REPLACE FUNCTION get_payment_method_config(
    p_method_id VARCHAR(50),
    p_amount DECIMAL(12,2)
)
RETURNS JSON AS $$
DECLARE
    method_config JSON;
BEGIN
    SELECT json_build_object(
        'id', id,
        'name', name,
        'provider', provider,
        'region', region,
        'base_fee_percentage', base_fee_percentage,
        'fixed_fee', fixed_fee,
        'calculated_fee', (p_amount * base_fee_percentage / 100) + fixed_fee,
        'total_amount', p_amount + (p_amount * base_fee_percentage / 100) + fixed_fee,
        'processing_time', processing_time,
        'supported_currencies', supported_currencies
    ) INTO method_config
    FROM payment_methods
    WHERE id = p_method_id AND is_active = true;
    
    RETURN method_config;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- 10. VALIDATION VIEWS
-- =====================================================================================

-- View for payment session summary
CREATE OR REPLACE VIEW payment_session_summary AS
SELECT 
    id,
    session_token,
    user_id,
    payment_provider,
    region,
    payment_method,
    product_name,
    amount,
    currency,
    total_amount,
    status,
    expires_at,
    created_at,
    CASE 
        WHEN expires_at < NOW() THEN 'expired'
        WHEN status = 'completed' THEN 'completed'
        WHEN status = 'failed' THEN 'failed'
        WHEN status = 'cancelled' THEN 'cancelled'
        ELSE 'active'
    END as session_state
FROM payment_sessions;

-- View for payment analytics
CREATE OR REPLACE VIEW payment_analytics AS
SELECT 
    date_trunc('day', processed_at) as payment_date,
    payment_provider,
    region,
    currency,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    SUM(fees) as total_fees
FROM receipts 
WHERE processed_at IS NOT NULL 
    AND payment_status = 'completed'
GROUP BY date_trunc('day', processed_at), payment_provider, region, currency
ORDER BY payment_date DESC;

-- =====================================================================================
-- MIGRATION COMPLETE
-- =====================================================================================

-- Log the completion of this migration
DO $$
BEGIN
    RAISE NOTICE 'Payment schema extensions migration completed successfully at %', NOW();
END $$;