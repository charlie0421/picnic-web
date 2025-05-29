-- 투표 시스템 실시간 업데이트를 위한 데이터베이스 트리거 설정
-- 이 스크립트는 Supabase 프로젝트의 SQL 에디터에서 실행해야 합니다.

-- 1. Realtime 활성화 (이미 활성화되어 있을 수 있음)
-- 투표 관련 테이블들에 대해 Realtime을 활성화합니다.

-- vote 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE vote;

-- vote_item 테이블 Realtime 활성화  
ALTER PUBLICATION supabase_realtime ADD TABLE vote_item;

-- vote_pick 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE vote_pick;

-- artist_vote 테이블 Realtime 활성화 (아티스트 투표용)
ALTER PUBLICATION supabase_realtime ADD TABLE artist_vote;

-- artist_vote_item 테이블 Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE artist_vote_item;

-- 2. 투표 집계 업데이트 함수 생성
-- 투표가 추가/수정/삭제될 때 vote_item의 집계 데이터를 자동으로 업데이트하는 함수

CREATE OR REPLACE FUNCTION update_vote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- vote_pick이 INSERT/UPDATE/DELETE될 때 해당 vote_item의 총 투표수 업데이트
  IF TG_OP = 'DELETE' THEN
    -- 삭제된 경우 OLD 레코드 사용
    UPDATE vote_item 
    SET 
      vote_total = COALESCE((
        SELECT SUM(vote_amount) 
        FROM vote_pick 
        WHERE vote_item_id = OLD.vote_item_id
      ), 0),
      updated_at = NOW()
    WHERE id = OLD.vote_item_id;
    
    RETURN OLD;
  ELSE
    -- INSERT 또는 UPDATE인 경우 NEW 레코드 사용
    UPDATE vote_item 
    SET 
      vote_total = COALESCE((
        SELECT SUM(vote_amount) 
        FROM vote_pick 
        WHERE vote_item_id = NEW.vote_item_id
      ), 0),
      updated_at = NOW()
    WHERE id = NEW.vote_item_id;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. 투표 집계 트리거 생성
-- vote_pick 테이블에 변경이 있을 때마다 vote_item 집계 업데이트

DROP TRIGGER IF EXISTS trigger_update_vote_item_totals ON vote_pick;

CREATE TRIGGER trigger_update_vote_item_totals
  AFTER INSERT OR UPDATE OR DELETE ON vote_pick
  FOR EACH ROW
  EXECUTE FUNCTION update_vote_item_totals();

-- 4. 아티스트 투표 집계 업데이트 함수 (아티스트 투표가 있는 경우)
-- 아티스트 투표 시스템이 별도로 있다면 사용

CREATE OR REPLACE FUNCTION update_artist_vote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- artist_vote_pick이 있다면 해당 테이블명으로 수정 필요
  -- 현재는 artist_vote_item 테이블 자체에 투표 수가 저장된다고 가정
  
  IF TG_OP = 'DELETE' THEN
    -- 아티스트 투표 삭제 시 처리 로직
    RETURN OLD;
  ELSE
    -- 아티스트 투표 추가/수정 시 처리 로직
    UPDATE artist_vote_item 
    SET updated_at = NOW()
    WHERE id = NEW.id;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. 투표 상태 업데이트 함수
-- 투표 시작/종료 시간에 따라 상태를 자동으로 업데이트

CREATE OR REPLACE FUNCTION update_vote_status()
RETURNS TRIGGER AS $$
BEGIN
  -- 투표 시작/종료 시간 변경 시 상태 업데이트
  IF NEW.start_date IS DISTINCT FROM OLD.start_date OR 
     NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    
    -- 현재 시간 기준으로 상태 결정
    IF NOW() < NEW.start_date THEN
      NEW.status = 'upcoming';
    ELSIF NOW() >= NEW.start_date AND NOW() <= NEW.end_date THEN
      NEW.status = 'ongoing';
    ELSE
      NEW.status = 'ended';
    END IF;
    
    NEW.updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 투표 상태 업데이트 트리거
DROP TRIGGER IF EXISTS trigger_update_vote_status ON vote;

CREATE TRIGGER trigger_update_vote_status
  BEFORE UPDATE ON vote
  FOR EACH ROW
  EXECUTE FUNCTION update_vote_status();

-- 7. 실시간 알림 함수 (선택사항)
-- 특정 이벤트 발생 시 추가적인 알림을 보내는 함수

CREATE OR REPLACE FUNCTION notify_vote_update()
RETURNS TRIGGER AS $$
BEGIN
  -- PostgreSQL NOTIFY를 사용한 추가 알림
  -- 클라이언트에서 LISTEN으로 수신 가능
  
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify('vote_update', json_build_object(
      'type', 'vote_pick_created',
      'vote_id', NEW.vote_id,
      'vote_item_id', NEW.vote_item_id,
      'user_id', NEW.user_id,
      'vote_amount', NEW.vote_amount
    )::text);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM pg_notify('vote_update', json_build_object(
      'type', 'vote_item_updated',
      'vote_id', NEW.vote_id,
      'vote_item_id', NEW.vote_item_id
    )::text);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 8. 실시간 알림 트리거 (선택사항)
DROP TRIGGER IF EXISTS trigger_notify_vote_update ON vote_pick;

CREATE TRIGGER trigger_notify_vote_update
  AFTER INSERT OR UPDATE ON vote_pick
  FOR EACH ROW
  EXECUTE FUNCTION notify_vote_update();

-- 9. RLS (Row Level Security) 정책 확인
-- 실시간 업데이트가 제대로 작동하려면 적절한 RLS 정책이 필요합니다.

-- 투표 결과는 모든 사용자가 읽을 수 있도록 설정 (예시)
-- 실제 정책은 프로젝트 요구사항에 따라 조정 필요

-- vote 테이블 읽기 정책 (예시)
-- CREATE POLICY "Anyone can view votes" ON vote FOR SELECT USING (true);

-- vote_item 테이블 읽기 정책 (예시)  
-- CREATE POLICY "Anyone can view vote items" ON vote_item FOR SELECT USING (true);

-- vote_pick 테이블 정책은 보안상 제한적으로 설정
-- CREATE POLICY "Users can view own vote picks" ON vote_pick FOR SELECT USING (auth.uid() = user_id);

-- 10. 인덱스 최적화 (성능 향상)
-- 실시간 쿼리 성능을 위한 인덱스 생성

-- vote_pick 테이블의 집계 쿼리 최적화
CREATE INDEX IF NOT EXISTS idx_vote_pick_vote_item_id ON vote_pick(vote_item_id);
CREATE INDEX IF NOT EXISTS idx_vote_pick_vote_id ON vote_pick(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_pick_user_id ON vote_pick(user_id);

-- vote_item 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_vote_item_vote_id ON vote_item(vote_id);

-- 투표 상태 및 시간 기반 쿼리 최적화
CREATE INDEX IF NOT EXISTS idx_vote_status ON vote(status);
CREATE INDEX IF NOT EXISTS idx_vote_dates ON vote(start_date, end_date);

-- 완료 메시지
SELECT 'Realtime vote triggers and functions have been created successfully!' as message; 