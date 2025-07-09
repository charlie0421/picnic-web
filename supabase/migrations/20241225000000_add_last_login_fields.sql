-- Add last login fields to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_login_provider TEXT,
ADD COLUMN last_login_provider_display TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_login_at 
ON user_profiles(last_login_at);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.last_login_at IS '최근 로그인 시간';
COMMENT ON COLUMN user_profiles.last_login_provider IS '최근 로그인 제공자 (google, kakao, apple, email 등)';
COMMENT ON COLUMN user_profiles.last_login_provider_display IS '최근 로그인 제공자 표시명 (Google, Kakao, Apple 등)'; 