-- USDT OBS Donation System Database Schema
-- Updated for tail-based amount matching: 2025-09-13

-- Drop existing tables and types
DROP TABLE IF EXISTS donations CASCADE;
DROP TYPE IF EXISTS donation_status CASCADE;

-- Enum types
CREATE TYPE donation_status AS ENUM ('PENDING', 'PENDING_SHOWN', 'CONFIRMED', 'EXPIRED');

-- Donations table with tail-based amount matching
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    status donation_status NOT NULL DEFAULT 'PENDING',
    
    -- Amount structure for tail matching
    base_amount DECIMAL(18,6) NOT NULL CHECK (base_amount >= 1.0),
    tail DECIMAL(18,6) NOT NULL CHECK (tail >= 0.0001 AND tail <= 0.9999),
    pay_amount DECIMAL(18,6) NOT NULL CHECK (pay_amount = base_amount + tail),
    
    -- User info (optional)
    nickname VARCHAR(100),
    message TEXT,
    
    -- Transaction tracking
    tx_hash VARCHAR(100) UNIQUE,
    first_block INTEGER,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    -- Expiry
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Ensure pay_amount uniqueness within valid time window
    CONSTRAINT pay_amount_unique_active UNIQUE (pay_amount) DEFERRABLE INITIALLY DEFERRED
);

-- Indexes for performance
CREATE INDEX idx_donations_status ON donations(status);
CREATE INDEX idx_donations_created_at ON donations(created_at DESC);
CREATE INDEX idx_donations_pay_amount ON donations(pay_amount);
CREATE INDEX idx_donations_expires_at ON donations(expires_at);
CREATE INDEX idx_donations_tx_hash ON donations(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX idx_donations_confirmed_at ON donations(confirmed_at) WHERE confirmed_at IS NOT NULL;
CREATE INDEX idx_donations_first_block ON donations(first_block) WHERE first_block IS NOT NULL;

-- Index for finding pending donations by amount within time window
CREATE INDEX idx_donations_pending_amount ON donations(pay_amount, expires_at) 
WHERE status = 'PENDING';

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_donations_updated_at 
    BEFORE UPDATE ON donations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert test data (for development)
INSERT INTO donations (base_amount, tail, pay_amount, nickname, message, status, expires_at) VALUES
(10.0, 0.0001, 10.0001, '測試用戶', '這是測試抖內訊息', 'PENDING', NOW() + INTERVAL '30 minutes'),
(5.0, 0.1234, 5.1234, 'TestUser', 'Hello World!', 'CONFIRMED', NOW() + INTERVAL '30 minutes');