// =====================================================================================
// UPDATED SUPABASE TYPES FOR PAYMENT FEATURE
// =====================================================================================
// Generated on: 2025-06-25
// 
// This file contains the updated TypeScript type definitions for Supabase tables
// that have been extended to support the payment feature. These types should be
// merged into the main types/supabase.ts file after the migration is applied.
// =====================================================================================

export interface Json {
  [key: string]: any
}

// =====================================================================================
// UPDATED RECEIPTS TABLE TYPE
// =====================================================================================

export interface ReceiptsTable {
  Row: {
    // Existing fields
    created_at: string | null
    environment: string | null
    id: number
    platform: string
    product_id: string | null
    receipt_data: string
    receipt_hash: string | null
    status: string
    user_id: string | null
    verification_data: Json | null
    
    // New payment-related fields
    payment_provider: 'portone' | 'paypal' | null
    region: 'korea' | 'global' | null
    payment_method: string | null
    amount: number | null
    currency: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' | null
    transaction_id: string | null
    processed_at: string | null
    fees: number | null
    payment_status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null
    payment_details: Json | null
  }
  Insert: {
    // Existing fields
    created_at?: string | null
    environment?: string | null
    id?: number
    platform: string
    product_id?: string | null
    receipt_data: string
    receipt_hash?: string | null
    status: string
    user_id?: string | null
    verification_data?: Json | null
    
    // New payment-related fields
    payment_provider?: 'portone' | 'paypal' | null
    region?: 'korea' | 'global' | null
    payment_method?: string | null
    amount?: number | null
    currency?: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' | null
    transaction_id?: string | null
    processed_at?: string | null
    fees?: number | null
    payment_status?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null
    payment_details?: Json | null
  }
  Update: {
    // Existing fields
    created_at?: string | null
    environment?: string | null
    id?: number
    platform?: string
    product_id?: string | null
    receipt_data?: string
    receipt_hash?: string | null
    status?: string
    user_id?: string | null
    verification_data?: Json | null
    
    // New payment-related fields
    payment_provider?: 'portone' | 'paypal' | null
    region?: 'korea' | 'global' | null
    payment_method?: string | null
    amount?: number | null
    currency?: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' | null
    transaction_id?: string | null
    processed_at?: string | null
    fees?: number | null
    payment_status?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | null
    payment_details?: Json | null
  }
  Relationships: []
}

// =====================================================================================
// NEW PAYMENT SESSIONS TABLE TYPE
// =====================================================================================

export interface PaymentSessionsTable {
  Row: {
    id: string
    session_token: string
    user_id: string | null
    
    // Payment configuration
    payment_provider: 'portone' | 'paypal'
    region: 'korea' | 'global'
    payment_method: string | null
    
    // Product and pricing information
    product_id: string
    product_name: string
    product_category: 'stars' | 'bonus' | 'premium' | null
    quantity: number | null
    
    // Financial information
    amount: number
    currency: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY'
    fees: number | null
    fixed_fees: number | null
    discount_amount: number | null
    tax_amount: number | null
    total_amount: number
    
    // Session management
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired' | null
    expires_at: string
    
    // Metadata and tracking
    metadata: Json | null
    user_agent: string | null
    ip_address: string | null
    
    // Audit fields
    created_at: string | null
    updated_at: string | null
    completed_at: string | null
  }
  Insert: {
    id?: string
    session_token: string
    user_id?: string | null
    
    // Payment configuration
    payment_provider: 'portone' | 'paypal'
    region: 'korea' | 'global'
    payment_method?: string | null
    
    // Product and pricing information
    product_id: string
    product_name: string
    product_category?: 'stars' | 'bonus' | 'premium' | null
    quantity?: number | null
    
    // Financial information
    amount: number
    currency: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY'
    fees?: number | null
    fixed_fees?: number | null
    discount_amount?: number | null
    tax_amount?: number | null
    total_amount: number
    
    // Session management
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired' | null
    expires_at: string
    
    // Metadata and tracking
    metadata?: Json | null
    user_agent?: string | null
    ip_address?: string | null
    
    // Audit fields
    created_at?: string | null
    updated_at?: string | null
    completed_at?: string | null
  }
  Update: {
    id?: string
    session_token?: string
    user_id?: string | null
    
    // Payment configuration
    payment_provider?: 'portone' | 'paypal'
    region?: 'korea' | 'global'
    payment_method?: string | null
    
    // Product and pricing information
    product_id?: string
    product_name?: string
    product_category?: 'stars' | 'bonus' | 'premium' | null
    quantity?: number | null
    
    // Financial information
    amount?: number
    currency?: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY'
    fees?: number | null
    fixed_fees?: number | null
    discount_amount?: number | null
    tax_amount?: number | null
    total_amount?: number
    
    // Session management
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired' | null
    expires_at?: string
    
    // Metadata and tracking
    metadata?: Json | null
    user_agent?: string | null
    ip_address?: string | null
    
    // Audit fields
    created_at?: string | null
    updated_at?: string | null
    completed_at?: string | null
  }
  Relationships: [
    {
      foreignKeyName: "payment_sessions_user_id_fkey"
      columns: ["user_id"]
      isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "fk_payment_sessions_product_id"
      columns: ["product_id"]
      isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
  ]
}

// =====================================================================================
// NEW PAYMENT METHODS TABLE TYPE
// =====================================================================================

export interface PaymentMethodsTable {
  Row: {
    id: string
    name: string
    provider: 'portone' | 'paypal'
    region: 'korea' | 'global'
    
    // Method configuration
    base_fee_percentage: number | null
    fixed_fee: number | null
    min_amount: number | null
    max_amount: number | null
    
    // Supported currencies (JSON array)
    supported_currencies: Json
    
    // Method properties
    processing_time: string | null
    is_active: boolean | null
    sort_order: number | null
    
    // Additional configuration
    config: Json | null
    
    // Audit fields
    created_at: string | null
    updated_at: string | null
  }
  Insert: {
    id: string
    name: string
    provider: 'portone' | 'paypal'
    region: 'korea' | 'global'
    
    // Method configuration
    base_fee_percentage?: number | null
    fixed_fee?: number | null
    min_amount?: number | null
    max_amount?: number | null
    
    // Supported currencies (JSON array)
    supported_currencies?: Json
    
    // Method properties
    processing_time?: string | null
    is_active?: boolean | null
    sort_order?: number | null
    
    // Additional configuration
    config?: Json | null
    
    // Audit fields
    created_at?: string | null
    updated_at?: string | null
  }
  Update: {
    id?: string
    name?: string
    provider?: 'portone' | 'paypal'
    region?: 'korea' | 'global'
    
    // Method configuration
    base_fee_percentage?: number | null
    fixed_fee?: number | null
    min_amount?: number | null
    max_amount?: number | null
    
    // Supported currencies (JSON array)
    supported_currencies?: Json
    
    // Method properties
    processing_time?: string | null
    is_active?: boolean | null
    sort_order?: number | null
    
    // Additional configuration
    config?: Json | null
    
    // Audit fields
    created_at?: string | null
    updated_at?: string | null
  }
  Relationships: []
}

// =====================================================================================
// VIEWS
// =====================================================================================

export interface PaymentSessionSummaryView {
  Row: {
    id: string | null
    session_token: string | null
    user_id: string | null
    payment_provider: 'portone' | 'paypal' | null
    region: 'korea' | 'global' | null
    payment_method: string | null
    product_name: string | null
    amount: number | null
    currency: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' | null
    total_amount: number | null
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired' | null
    expires_at: string | null
    created_at: string | null
    session_state: string | null
  }
  Relationships: []
}

export interface PaymentAnalyticsView {
  Row: {
    payment_date: string | null
    payment_provider: 'portone' | 'paypal' | null
    region: 'korea' | 'global' | null
    currency: 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' | null
    transaction_count: number | null
    total_amount: number | null
    avg_amount: number | null
    total_fees: number | null
  }
  Relationships: []
}

// =====================================================================================
// FUNCTIONS
// =====================================================================================

export interface DatabaseFunctions {
  cleanup_expired_payment_sessions: {
    Args: Record<PropertyKey, never>
    Returns: number
  }
  get_payment_method_config: {
    Args: {
      p_method_id: string
      p_amount: number
    }
    Returns: Json
  }
}

// =====================================================================================
// UPDATED DATABASE TYPE INTERFACE
// =====================================================================================

export interface UpdatedDatabaseTables {
  // Updated existing table
  receipts: ReceiptsTable
  
  // New tables
  payment_sessions: PaymentSessionsTable
  payment_methods: PaymentMethodsTable
}

export interface UpdatedDatabaseViews {
  payment_session_summary: PaymentSessionSummaryView
  payment_analytics: PaymentAnalyticsView
}

// Helper types for client usage
export type PaymentSession = PaymentSessionsTable['Row']
export type PaymentSessionInsert = PaymentSessionsTable['Insert']
export type PaymentSessionUpdate = PaymentSessionsTable['Update']

export type PaymentMethod = PaymentMethodsTable['Row']
export type PaymentMethodInsert = PaymentMethodsTable['Insert']
export type PaymentMethodUpdate = PaymentMethodsTable['Update']

export type Receipt = ReceiptsTable['Row']
export type ReceiptInsert = ReceiptsTable['Insert']
export type ReceiptUpdate = ReceiptsTable['Update']

// Payment-specific type guards
export function isKoreanPaymentProvider(provider: string): provider is 'portone' {
  return provider === 'portone'
}

export function isGlobalPaymentProvider(provider: string): provider is 'paypal' {
  return provider === 'paypal'
}

export function isValidCurrency(currency: string): currency is 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY' {
  return ['KRW', 'USD', 'EUR', 'GBP', 'JPY'].includes(currency)
}

export function isValidRegion(region: string): region is 'korea' | 'global' {
  return ['korea', 'global'].includes(region)
}

// =====================================================================================
// INTEGRATION NOTES
// =====================================================================================

/*
INTEGRATION INSTRUCTIONS:

1. After running the database migration (schema-extensions.sql), merge these types
   into your main types/supabase.ts file.

2. Update the main Database interface to include the new tables:
   ```typescript
   export interface Database {
     public: {
       Tables: {
         // ... existing tables
         receipts: ReceiptsTable         // Updated table
         payment_sessions: PaymentSessionsTable  // New table
         payment_methods: PaymentMethodsTable    // New table
       }
       Views: {
         // ... existing views
         payment_session_summary: PaymentSessionSummaryView
         payment_analytics: PaymentAnalyticsView
       }
       Functions: DatabaseFunctions & {
         // ... existing functions
       }
     }
   }
   ```

3. Update your Supabase client imports to use the new types:
   ```typescript
   import { PaymentSession, PaymentMethod, Receipt } from '@/types/supabase'
   ```

4. The payment components in components/client/vote/dialogs/payment/ are already
   compatible with these types.
*/