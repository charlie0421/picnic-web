import { _getVotes, _getVoteById, _getVoteItems, _getVoteRewards } from "./queries-vote";
import { _getRewards, _getBanners, _getRewardById, _getMedias, _getPopups } from "./queries-content";
import { withRetry } from "./retry-utils";

// 재시도 메커니즘이 적용된 내보내기 함수
export const getVotes = withRetry(_getVotes);
export const getRewards = withRetry(_getRewards);
export const getBanners = withRetry(_getBanners);
export const getRewardById = withRetry(_getRewardById);
export const getMedias = withRetry(_getMedias);
export const getVoteById = withRetry(_getVoteById);
export const getVoteItems = withRetry(_getVoteItems);
export const getVoteRewards = withRetry(_getVoteRewards);
export const getPopups = withRetry(_getPopups);
