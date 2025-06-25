-- =====================================================================================
-- FORWARD MIGRATION: Payment Schema Extension
-- =====================================================================================
-- Migration ID: 001_payment_schema_forward
-- Created: 2025-06-25
-- Description: Extend database schema to support Port One (Korea) and PayPal (Global) payments
-- 
-- This migration adds payment functionality to the existing Picnic application database.
-- It extends the receipts table and creates new tables for payment sessions and methods.
-- 
-- SAFETY FEATURES:
-- - Uses IF NOT EXISTS for safe re-execution
-- - Transactions for atomicity
-- - Validation checks throughout
-- - Rollback capability
-- - Progress logging
-- =====================================================================================

-- Start transaction for atomicity
BEGIN;

-- Set migration metadata
SET LOCAL application_name = 'payment_migration_001';
SET LOCAL search_path = public;

-- =====================================================================================
-- STEP 1: MIGRATION VALIDATION AND SETUP
-- =====================================================================================

-- Create migration tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS _migration_log (
  id SERIAL PRIMARY KEY,
  migration_id VARCHAR(50) NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  details TEXT,
  execution_time_ms INTEGER
);

-- Log migration start
INSERT INTO _migration_log (migration_id, step_name, status, details) 
VALUES ('001_payment_schema_forward', 'migration_start', 'started', 'Beginning payment schema extension migration');

-- Validate prerequisites
DO $$
DECLARE
  receipts_exists BOOLEAN;
  products_exists BOOLEAN;
BEGIN
  -- Check if receipts table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'receipts'
  ) INTO receipts_exists;
  
  IF NOT receipts_exists THEN
    RAISE EXCEPTION 'receipts table does not exist. Cannot proceed with migration.';
  END IF;
  
  -- Check if products table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'products'
  ) INTO products_exists;
  
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'prerequisites_validation', 'completed', 
          format('receipts_exists: %s, products_exists: %s', receipts_exists, products_exists));
END $$;

-- =====================================================================================
-- STEP 2: EXTEND RECEIPTS TABLE
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'receipts_extension', 'started', 'Adding new columns to receipts table');

  -- Add new columns to receipts table
  -- Using IF NOT EXISTS equivalent with exception handling
  BEGIN
    ALTER TABLE receipts ADD COLUMN payment_provider VARCHAR(20) CHECK (payment_provider IN ('portone', 'paypal'));
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN region VARCHAR(10) CHECK (region IN ('korea', 'global'));
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN payment_method VARCHAR(50);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN amount DECIMAL(12,2);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN currency VARCHAR(3) CHECK (currency IN ('KRW', 'USD', 'EUR', 'GBP', 'JPY'));
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN transaction_id VARCHAR(255);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN fees DECIMAL(10,2);
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN payment_status VARCHAR(20) CHECK (payment_status IN ('idle', 'pending', 'processing', 'completed', 'failed', 'cancelled'));
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE receipts ADD COLUMN payment_details JSONB;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END;

  -- Add column comments
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

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'receipts_extension', 'completed', execution_ms, 'Successfully added 10 new columns to receipts table');
END $$;

-- =====================================================================================
-- STEP 3: CREATE PAYMENT_SESSIONS TABLE
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
  table_exists BOOLEAN;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'payment_sessions_creation', 'started', 'Creating payment_sessions table');

  -- Check if table already exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'payment_sessions'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    CREATE TABLE payment_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token VARCHAR(255) UNIQUE NOT NULL,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      
      -- Payment configuration
      payment_provider VARCHAR(20) NOT NULL CHECK (payment_provider IN ('portone', 'paypal')),
      region VARCHAR(10) NOT NULL CHECK (region IN ('korea', 'global')),
      payment_method VARCHAR(50),
      
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
  END IF;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'payment_sessions_creation', 'completed', execution_ms, 
          format('Table creation: %s', CASE WHEN table_exists THEN 'skipped (already exists)' ELSE 'created' END));
END $$;

-- =====================================================================================
-- STEP 4: CREATE PAYMENT_METHODS TABLE
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
  table_exists BOOLEAN;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'payment_methods_creation', 'started', 'Creating payment_methods table');

  -- Check if table already exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'payment_methods'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    CREATE TABLE payment_methods (
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
      processing_time VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      
      -- Additional configuration
      config JSONB DEFAULT '{}',
      
      -- Audit fields
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      
      -- Constraints
      CONSTRAINT valid_fee_range CHECK (base_fee_percentage <= 10),
      CONSTRAINT valid_amount_range CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount)
    );

    -- Add table comments
    COMMENT ON TABLE payment_methods IS 'Configuration for available payment methods per region and provider';
    COMMENT ON COLUMN payment_methods.supported_currencies IS 'JSON array of supported currency codes';
    COMMENT ON COLUMN payment_methods.config IS 'Provider-specific configuration and settings';
  END IF;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'payment_methods_creation', 'completed', execution_ms, 
          format('Table creation: %s', CASE WHEN table_exists THEN 'skipped (already exists)' ELSE 'created' END));
END $$;

-- =====================================================================================
-- STEP 5: CREATE INDEXES
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'indexes_creation', 'started', 'Creating performance indexes');

  -- Indexes for receipts table
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_user_payment_provider 
    ON receipts(user_id, payment_provider) 
    WHERE payment_provider IS NOT NULL;

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_transaction_id 
    ON receipts(transaction_id) 
    WHERE transaction_id IS NOT NULL;

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_processed_at 
    ON receipts(processed_at) 
    WHERE processed_at IS NOT NULL;

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_payment_status 
    ON receipts(payment_status) 
    WHERE payment_status IS NOT NULL;

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_region_currency 
    ON receipts(region, currency) 
    WHERE region IS NOT NULL AND currency IS NOT NULL;

  -- Indexes for payment_sessions table
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_user_id 
    ON payment_sessions(user_id);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_status 
    ON payment_sessions(status);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_expires_at 
    ON payment_sessions(expires_at);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_session_token 
    ON payment_sessions(session_token);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_created_at 
    ON payment_sessions(created_at);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_sessions_provider_region 
    ON payment_sessions(payment_provider, region);

  -- Indexes for payment_methods table
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_provider_region 
    ON payment_methods(provider, region);

  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_methods_active 
    ON payment_methods(is_active, sort_order) 
    WHERE is_active = true;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'indexes_creation', 'completed', execution_ms, 'Created 13 performance indexes');
END $$;

-- =====================================================================================
-- STEP 6: SET UP ROW LEVEL SECURITY (RLS)
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'rls_setup', 'started', 'Setting up Row Level Security policies');

  -- Enable RLS on payment_sessions table
  ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS payment_sessions_user_access ON payment_sessions;
  DROP POLICY IF EXISTS payment_sessions_service_access ON payment_sessions;

  -- Users can only access their own payment sessions
  CREATE POLICY payment_sessions_user_access ON payment_sessions
    FOR ALL USING (auth.uid() = user_id);

  -- Service role can access all sessions (for admin/monitoring)
  CREATE POLICY payment_sessions_service_access ON payment_sessions
    FOR ALL USING (auth.role() = 'service_role');

  -- Enable RLS on payment_methods table  
  ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS payment_methods_read_access ON payment_methods;
  DROP POLICY IF EXISTS payment_methods_service_access ON payment_methods;

  -- All authenticated users can read payment methods
  CREATE POLICY payment_methods_read_access ON payment_methods
    FOR SELECT USING (auth.role() = 'authenticated');

  -- Only service role can modify payment methods
  CREATE POLICY payment_methods_service_access ON payment_methods
    FOR ALL USING (auth.role() = 'service_role');

  -- Update existing receipts RLS if needed
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS receipts_user_select ON receipts;
  DROP POLICY IF EXISTS receipts_user_insert ON receipts;
  DROP POLICY IF EXISTS receipts_user_update ON receipts;

  -- Users can only see their own receipts
  CREATE POLICY receipts_user_select ON receipts
    FOR SELECT USING (auth.uid() = user_id);

  -- Users can insert their own receipts
  CREATE POLICY receipts_user_insert ON receipts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- Users can update their own receipts (for status updates)
  CREATE POLICY receipts_user_update ON receipts
    FOR UPDATE USING (auth.uid() = user_id);

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'rls_setup', 'completed', execution_ms, 'Set up RLS policies for all payment tables');
END $$;

-- =====================================================================================
-- STEP 7: CREATE FOREIGN KEY CONSTRAINTS
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
  products_exists BOOLEAN;
  constraint_exists BOOLEAN;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'foreign_keys', 'started', 'Adding foreign key constraints');

  -- Check if products table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'products'
  ) INTO products_exists;
  
  IF products_exists THEN
    -- Check if constraint already exists
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE constraint_name = 'fk_payment_sessions_product_id'
      AND table_name = 'payment_sessions'
    ) INTO constraint_exists;
    
    IF NOT constraint_exists THEN
      ALTER TABLE payment_sessions 
      ADD CONSTRAINT fk_payment_sessions_product_id 
      FOREIGN KEY (product_id) REFERENCES products(id) 
      ON DELETE RESTRICT;
    END IF;
  END IF;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'foreign_keys', 'completed', execution_ms, 
          format('Products table exists: %s, FK constraint: %s', 
                 products_exists, 
                 CASE WHEN products_exists AND NOT constraint_exists THEN 'added' 
                      WHEN products_exists AND constraint_exists THEN 'already exists'
                      ELSE 'skipped (no products table)' END));
END $$;

-- =====================================================================================
-- STEP 8: CREATE TRIGGERS
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'triggers_creation', 'started', 'Creating audit triggers');

  -- Update trigger for payment_sessions updated_at
  CREATE OR REPLACE FUNCTION update_payment_sessions_updated_at()
  RETURNS TRIGGER AS $trigger$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $trigger$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS payment_sessions_updated_at_trigger ON payment_sessions;
  CREATE TRIGGER payment_sessions_updated_at_trigger
      BEFORE UPDATE ON payment_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_payment_sessions_updated_at();

  -- Update trigger for payment_methods updated_at
  CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
  RETURNS TRIGGER AS $trigger$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $trigger$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS payment_methods_updated_at_trigger ON payment_methods;
  CREATE TRIGGER payment_methods_updated_at_trigger
      BEFORE UPDATE ON payment_methods
      FOR EACH ROW
      EXECUTE FUNCTION update_payment_methods_updated_at();

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'triggers_creation', 'completed', execution_ms, 'Created audit triggers for updated_at columns');
END $$;

-- =====================================================================================
-- STEP 9: CREATE UTILITY FUNCTIONS
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'utility_functions', 'started', 'Creating utility functions');

  -- Function to clean up expired payment sessions
  CREATE OR REPLACE FUNCTION cleanup_expired_payment_sessions()
  RETURNS INTEGER AS $func$
  DECLARE
      deleted_count INTEGER;
  BEGIN
      DELETE FROM payment_sessions 
      WHERE expires_at < NOW() 
      AND status IN ('pending', 'processing');
      
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RETURN deleted_count;
  END;
  $func$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Function to get payment method configuration
  CREATE OR REPLACE FUNCTION get_payment_method_config(
      p_method_id VARCHAR(50),
      p_amount DECIMAL(12,2)
  )
  RETURNS JSON AS $func$
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
  $func$ LANGUAGE plpgsql SECURITY DEFINER;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'utility_functions', 'completed', execution_ms, 'Created 2 utility functions');
END $$;

-- =====================================================================================
-- STEP 10: CREATE VIEWS
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'views_creation', 'started', 'Creating analytical views');

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

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'views_creation', 'completed', execution_ms, 'Created 2 analytical views');
END $$;

-- =====================================================================================
-- STEP 11: SEED INITIAL DATA
-- =====================================================================================

DO $$
DECLARE
  start_time TIMESTAMP := clock_timestamp();
  end_time TIMESTAMP;
  execution_ms INTEGER;
  kr_count INTEGER;
  gl_count INTEGER;
BEGIN
  INSERT INTO _migration_log (migration_id, step_name, status, details) 
  VALUES ('001_payment_schema_forward', 'data_seeding', 'started', 'Seeding initial payment methods');

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

  -- Count inserted records
  SELECT COUNT(*) FROM payment_methods WHERE region = 'korea' INTO kr_count;
  SELECT COUNT(*) FROM payment_methods WHERE region = 'global' INTO gl_count;

  end_time := clock_timestamp();
  execution_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'data_seeding', 'completed', execution_ms, 
          format('Seeded payment methods - Korea: %s, Global: %s', kr_count, gl_count));
END $$;

-- =====================================================================================
-- STEP 12: MIGRATION COMPLETION
-- =====================================================================================

DO $$
DECLARE
  total_execution_ms INTEGER;
  start_time TIMESTAMP;
BEGIN
  -- Calculate total execution time
  SELECT EXTRACT(EPOCH FROM (MAX(executed_at) - MIN(executed_at))) * 1000 
  FROM _migration_log 
  WHERE migration_id = '001_payment_schema_forward' 
  INTO total_execution_ms;

  INSERT INTO _migration_log (migration_id, step_name, status, execution_time_ms, details) 
  VALUES ('001_payment_schema_forward', 'migration_complete', 'completed', total_execution_ms, 
          'Payment schema extension migration completed successfully');

  -- Log success message
  RAISE NOTICE 'Payment schema extension migration completed successfully in % ms', total_execution_ms;
  RAISE NOTICE 'Added 10 new columns to receipts table';
  RAISE NOTICE 'Created 2 new tables: payment_sessions, payment_methods';
  RAISE NOTICE 'Created 13 performance indexes';
  RAISE NOTICE 'Set up RLS policies for security';
  RAISE NOTICE 'Created 2 utility functions and 2 analytical views';
  RAISE NOTICE 'Seeded initial payment method configurations';
END $$;

-- Commit the transaction
COMMIT;

-- =====================================================================================
-- MIGRATION VERIFICATION
-- =====================================================================================

-- Verify the migration was successful
DO $$
DECLARE
  receipt_columns INTEGER;
  session_count INTEGER;
  method_count INTEGER;
  index_count INTEGER;
BEGIN
  -- Count new columns in receipts
  SELECT COUNT(*) 
  FROM information_schema.columns 
  WHERE table_name = 'receipts' 
  AND column_name IN ('payment_provider', 'region', 'payment_method', 'amount', 'currency', 
                      'transaction_id', 'processed_at', 'fees', 'payment_status', 'payment_details')
  INTO receipt_columns;
  
  -- Check table creation
  SELECT CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_sessions') THEN 1 ELSE 0 END INTO session_count;
  SELECT CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'payment_methods') THEN 1 ELSE 0 END INTO method_count;
  
  -- Count indexes
  SELECT COUNT(*) 
  FROM pg_indexes 
  WHERE tablename IN ('receipts', 'payment_sessions', 'payment_methods')
  AND indexname LIKE 'idx_%'
  INTO index_count;
  
  -- Verification report
  RAISE NOTICE '=== MIGRATION VERIFICATION REPORT ===';
  RAISE NOTICE 'Receipt table new columns: %/10', receipt_columns;
  RAISE NOTICE 'Payment sessions table: %', CASE WHEN session_count = 1 THEN 'CREATED' ELSE 'MISSING' END;
  RAISE NOTICE 'Payment methods table: %', CASE WHEN method_count = 1 THEN 'CREATED' ELSE 'MISSING' END;
  RAISE NOTICE 'Performance indexes: %', index_count;
  
  IF receipt_columns = 10 AND session_count = 1 AND method_count = 1 AND index_count >= 13 THEN
    RAISE NOTICE 'MIGRATION STATUS: ✅ SUCCESS';
  ELSE
    RAISE WARNING 'MIGRATION STATUS: ⚠️ PARTIAL - Some components may be missing';
  END IF;
END $$;