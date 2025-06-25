# Database Schema Documentation

## Current Schema Analysis

Generated on: 2025-06-25

### 1. Current Receipt Table Structure

Based on `types/supabase.ts`, the current `receipts` table has the following structure:

```sql
-- Current receipts table structure
receipts: {
  Row: {
    created_at: string | null
    environment: string | null        -- App Store environment (sandbox/production)
    id: number                       -- Primary key
    platform: string                 -- Platform (ios/android/etc)
    product_id: string | null        -- Product identifier from store
    receipt_data: string             -- Raw receipt data from store
    receipt_hash: string | null      -- Hash for deduplication
    status: string                   -- Verification status
    user_id: string | null           -- Foreign key to user_profiles
    verification_data: Json | null   -- Additional verification info
  }
}
```

### 2. Required Extensions for Payment Feature

The payment feature implementation requires the following schema extensions:

#### 2.1 Receipt Table Extensions

New columns to be added to `receipts` table:

```sql
-- New columns for receipts table
ALTER TABLE receipts ADD COLUMN payment_provider VARCHAR(50); -- 'portone' | 'paypal'
ALTER TABLE receipts ADD COLUMN region VARCHAR(20);           -- 'korea' | 'global' 
ALTER TABLE receipts ADD COLUMN payment_method VARCHAR(50);   -- 'card' | 'bank_transfer' | etc
ALTER TABLE receipts ADD COLUMN amount DECIMAL(10,2);         -- Payment amount
ALTER TABLE receipts ADD COLUMN currency VARCHAR(3);          -- 'KRW' | 'USD' | etc
ALTER TABLE receipts ADD COLUMN transaction_id VARCHAR(255);  -- External transaction ID
ALTER TABLE receipts ADD COLUMN processed_at TIMESTAMP;       -- When payment was processed
```

#### 2.2 New Payment Sessions Table

```sql
-- New payment_sessions table
CREATE TABLE payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  payment_provider VARCHAR(50) NOT NULL,    -- 'portone' | 'paypal'
  region VARCHAR(20) NOT NULL,              -- 'korea' | 'global'
  payment_method VARCHAR(50),               -- Selected payment method
  product_id VARCHAR(255) NOT NULL,         -- Product being purchased
  amount DECIMAL(10,2) NOT NULL,            -- Payment amount
  currency VARCHAR(3) NOT NULL,             -- Currency code
  fees DECIMAL(10,2),                       -- Payment fees
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  metadata JSONB,                           -- Additional session data
  expires_at TIMESTAMP NOT NULL,            -- Session expiration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Related Tables Analysis

#### 3.1 Products Table
```sql
-- Existing products table structure
products: {
  Row: {
    created_at: string | null
    description: Json | null
    end_at: string | null
    id: string                                    -- Product ID
    paypal_link: string | null                   -- PayPal payment link
    platform: Database["public"]["Enums"]["platform_enum"]
    price: number | null                         -- Product price
    product_name: string                         -- Product name
    product_type: Database["public"]["Enums"]["product_type_enum"]
    star_candy: number | null                    -- Virtual currency amount
    star_candy_bonus: number | null              -- Bonus amount
    start_at: string | null
  }
}
```

#### 3.2 User Profiles Table
- The `user_profiles` table already exists and is referenced by receipts
- No changes needed for user profiles

### 4. Indexes and Constraints

#### 4.1 Current Indexes
Based on the schema structure, the following indexes likely exist:
- Primary key on `receipts.id`
- Foreign key reference to `user_profiles`

#### 4.2 Required New Indexes
```sql
-- Performance indexes for receipts table
CREATE INDEX idx_receipts_user_payment_provider ON receipts(user_id, payment_provider);
CREATE INDEX idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX idx_receipts_processed_at ON receipts(processed_at);

-- Indexes for payment_sessions table
CREATE INDEX idx_payment_sessions_user_id ON payment_sessions(user_id);
CREATE INDEX idx_payment_sessions_status ON payment_sessions(status);
CREATE INDEX idx_payment_sessions_expires_at ON payment_sessions(expires_at);
CREATE INDEX idx_payment_sessions_session_token ON payment_sessions(session_token);
```

### 5. Row Level Security (RLS) Requirements

#### 5.1 Current RLS Status
- Need to verify current RLS policies on receipts table
- Typically restricted to user's own receipts

#### 5.2 Required RLS Policies

```sql
-- RLS for receipts table (enhanced)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own receipts
CREATE POLICY receipts_user_select ON receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own receipts
CREATE POLICY receipts_user_insert ON receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS for payment_sessions table
ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own payment sessions
CREATE POLICY payment_sessions_user_access ON payment_sessions
  FOR ALL USING (auth.uid() = user_id);
```

### 6. Foreign Key Constraints

```sql
-- Add foreign key constraints
ALTER TABLE payment_sessions 
  ADD CONSTRAINT fk_payment_sessions_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE payment_sessions 
  ADD CONSTRAINT fk_payment_sessions_product_id 
  FOREIGN KEY (product_id) REFERENCES products(id);
```

### 7. Data Migration Considerations

- Existing receipts will have NULL values for new columns initially
- Need to handle backward compatibility
- Consider data backfill for important columns
- Test migration on staging environment first

---

**Note**: This documentation reflects the current state as of Task 1.1 completion. 
Subsequent tasks will implement the actual schema changes described here.