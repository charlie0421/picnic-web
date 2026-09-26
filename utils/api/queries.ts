import * as React from "react";
import { _getVotes, _getVoteById, _getVoteItems, _getVoteRewards } from "./queries-vote";
import { _getRewards, _getBanners, _getRewardById, _getMedias, _getPopups } from "./queries-content";
import { withRetry } from "./retry-utils";

// React.cache: 서버 렌더 한 요청 안에서 같은 인자 호출을 한 번만 실행한다.
// 이 모듈은 클라이언트 훅(hooks/useBanner)도 import 하고 설치된 react 는 18 이라 cache 가 없을 수 있다 —
// 없으면 그대로 호출한다(요청 단위 공유만 빠진다).
const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof React.cache === "function" ? React.cache : (fn) => fn;

// 재시도 메커니즘이 적용된 내보내기 함수
export const getVotes = withRetry(_getVotes);
export const getRewards = withRetry(_getRewards);
export const getBanners = withRetry(_getBanners);
export const getRewardById = withRetry(_getRewardById);
export const getMedias = withRetry(_getMedias);
// 투표 상세의 generateMetadata 와 VoteDetailFetcher 가 같은 요청에서 부른다 — 한 번만 조회한다.
export const getVoteById = requestCache(withRetry(_getVoteById));
export const getVoteItems = withRetry(_getVoteItems);
export const getVoteRewards = withRetry(_getVoteRewards);
export const getPopups = withRetry(_getPopups);
