-- 에러 로그 테이블 생성
-- 이 스크립트는 Supabase SQL Editor에서 실행하거나 마이그레이션으로 적용할 수 있습니다.

-- 에러 로그 테이블
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  error_details JSONB,
  user_details JSONB,
  request_details JSONB,
  environment TEXT NOT NULL DEFAULT 'development',
  service TEXT NOT NULL DEFAULT 'picnic-web',
  version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs (level);
CREATE INDEX IF NOT EXISTS idx_error_logs_environment ON error_logs (environment);
CREATE INDEX IF NOT EXISTS idx_error_logs_service ON error_logs (service);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs USING GIN ((user_details->>'id'));

-- 복합 인덱스 (자주 사용되는 쿼리 패턴)
CREATE INDEX IF NOT EXISTS idx_error_logs_env_level_timestamp 
ON error_logs (environment, level, timestamp DESC);

-- 에러 레벨별 인덱스 (에러와 치명적 에러만)
CREATE INDEX IF NOT EXISTS idx_error_logs_critical 
ON error_logs (timestamp DESC) 
WHERE level IN ('error', 'fatal');

-- RLS (Row Level Security) 정책 설정
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- 관리자만 모든 로그에 접근 가능
CREATE POLICY "관리자는 모든 에러 로그에 접근 가능" ON error_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_app_meta_data->>'role' = 'admin'
    )
  );

-- 사용자는 자신의 로그만 조회 가능 (선택적)
CREATE POLICY "사용자는 자신의 에러 로그만 조회 가능" ON error_logs
  FOR SELECT USING (
    user_details->>'id' = auth.uid()::text
  );

-- 서비스 계정은 로그 삽입 가능
CREATE POLICY "서비스는 에러 로그 삽입 가능" ON error_logs
  FOR INSERT WITH CHECK (true);

-- 에러 로그 통계를 위한 뷰 생성
CREATE OR REPLACE VIEW error_log_stats AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  level,
  environment,
  service,
  COUNT(*) as count,
  COUNT(DISTINCT user_details->>'id') as unique_users
FROM error_logs
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), level, environment, service
ORDER BY hour DESC, level;

-- 최근 에러 요약 뷰
CREATE OR REPLACE VIEW recent_errors AS
SELECT 
  id,
  timestamp,
  level,
  message,
  error_details->>'name' as error_name,
  error_details->>'category' as error_category,
  user_details->>'id' as user_id,
  request_details->>'method' as request_method,
  request_details->>'url' as request_url,
  environment,
  service
FROM error_logs
WHERE level IN ('error', 'fatal')
  AND timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 100;

-- 에러 트렌드 분석을 위한 함수
CREATE OR REPLACE FUNCTION get_error_trends(
  start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
  end_time TIMESTAMPTZ DEFAULT NOW(),
  env TEXT DEFAULT NULL
)
RETURNS TABLE (
  period TIMESTAMPTZ,
  error_count BIGINT,
  fatal_count BIGINT,
  unique_users BIGINT,
  top_error_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE_TRUNC('hour', el.timestamp) as period,
    COUNT(*) FILTER (WHERE el.level = 'error') as error_count,
    COUNT(*) FILTER (WHERE el.level = 'fatal') as fatal_count,
    COUNT(DISTINCT el.user_details->>'id') as unique_users,
    MODE() WITHIN GROUP (ORDER BY el.error_details->>'category') as top_error_category
  FROM error_logs el
  WHERE el.timestamp BETWEEN start_time AND end_time
    AND (env IS NULL OR el.environment = env)
  GROUP BY DATE_TRUNC('hour', el.timestamp)
  ORDER BY period DESC;
END;
$$ LANGUAGE plpgsql;

-- 자동 정리 함수 (오래된 로그 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_error_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 30일 이상 된 debug, info 로그 삭제
  DELETE FROM error_logs 
  WHERE level IN ('debug', 'info') 
    AND timestamp < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- 90일 이상 된 warn 로그 삭제
  DELETE FROM error_logs 
  WHERE level = 'warn' 
    AND timestamp < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  -- 1년 이상 된 error, fatal 로그 삭제 (중요한 로그는 더 오래 보관)
  DELETE FROM error_logs 
  WHERE level IN ('error', 'fatal') 
    AND timestamp < NOW() - INTERVAL '1 year';
  
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 정리 작업을 위한 cron job 설정 (pg_cron 확장이 필요)
-- SELECT cron.schedule('cleanup-error-logs', '0 2 * * *', 'SELECT cleanup_old_error_logs();');

-- 에러 알림을 위한 함수 (웹훅 트리거용)
CREATE OR REPLACE FUNCTION notify_critical_error()
RETURNS TRIGGER AS $$
BEGIN
  -- 치명적 에러 발생 시 알림 (실제 구현에서는 웹훅 호출)
  IF NEW.level = 'fatal' THEN
    -- 여기에 외부 알림 시스템 연동 로직 추가
    -- 예: 슬랙, 이메일, SMS 등
    RAISE NOTICE '치명적 에러 발생: %', NEW.message;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 치명적 에러 알림 트리거
CREATE TRIGGER trigger_critical_error_notification
  AFTER INSERT ON error_logs
  FOR EACH ROW
  WHEN (NEW.level = 'fatal')
  EXECUTE FUNCTION notify_critical_error();

-- 테이블 코멘트
COMMENT ON TABLE error_logs IS '애플리케이션 에러 로그를 저장하는 테이블';
COMMENT ON COLUMN error_logs.level IS '로그 레벨: debug, info, warn, error, fatal';
COMMENT ON COLUMN error_logs.context IS '추가 컨텍스트 정보 (JSON)';
COMMENT ON COLUMN error_logs.error_details IS '에러 상세 정보 (이름, 스택 트레이스 등)';
COMMENT ON COLUMN error_logs.user_details IS '사용자 정보 (ID, 이메일 등)';
COMMENT ON COLUMN error_logs.request_details IS '요청 정보 (메서드, URL, 헤더 등)';

-- 초기 데이터 확인용 쿼리 (주석 처리)
/*
-- 에러 로그 통계 조회
SELECT level, COUNT(*) as count 
FROM error_logs 
GROUP BY level 
ORDER BY count DESC;

-- 최근 1시간 에러 조회
SELECT * FROM recent_errors;

-- 에러 트렌드 조회
SELECT * FROM get_error_trends();
*/ 