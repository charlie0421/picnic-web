/**
 * 투표 페이지 테스트를 위한 모의 데이터
 */

import { Artist, Reward, Vote, VoteItem } from "@/types/interfaces";

// 아티스트 생성 헬퍼 함수
const createArtist = (
  id: number,
  name: { ko: string; en: string },
  image: string,
): Artist => ({
  id,
  name,
  image,
  birth_date: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  dd: null,
  mm: null,
  yy: null,
  debut_date: null,
  debut_dd: null,
  debut_mm: null,
  debut_yy: null,
  deleted_at: null,
  gender: "female",
  group_id: null,
  is_kpop: true,
  is_musical: false,
  is_solo: false,
});

// 투표 목록을 위한 모의 데이터
export const mockVotes: Vote[] = [
  {
    id: 1,
    title: { ko: "인기 아티스트 투표", en: "Popular Artist Vote" },
    start_at: new Date(Date.now() - 86400000).toISOString(), // 하루 전
    stop_at: new Date(Date.now() + 86400000).toISOString(), // 하루 후
    main_image: "https://example.com/vote1.jpg",
    wait_image: "https://example.com/wait1.jpg",
    result_image: "https://example.com/result1.jpg",
    area: "kpop",
    vote_category: "artist",
    vote_sub_category: "popular",
    vote_content: "가장 좋아하는 아티스트에게 투표하세요",
    visible_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    deleted_at: null,
    order: 1,
    voteItem: [
      {
        id: 1,
        vote_id: 1,
        artist_id: 1,
        group_id: 1,
        vote_total: 1000,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        deleted_at: null,
        artist: createArtist(
          1,
          { ko: "아티스트 1", en: "Artist 1" },
          "https://example.com/artist1.jpg",
        ),
      },
      {
        id: 2,
        vote_id: 1,
        artist_id: 2,
        group_id: 1,
        vote_total: 800,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        deleted_at: null,
        artist: createArtist(
          2,
          { ko: "아티스트 2", en: "Artist 2" },
          "https://example.com/artist2.jpg",
        ),
      },
    ],
    voteReward: [
      {
        reward_id: 1,
        vote_id: 1,
        reward: {
          id: 1,
          title: { ko: "보상 1", en: "Reward 1" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          location: null,
          location_images: [],
          order: 1,
          overview_images: [],
          size_guide: null,
          size_guide_images: [],
          thumbnail: "https://example.com/reward1.jpg",
        },
      },
    ],
  },
  {
    id: 2,
    title: { ko: "신인상 투표", en: "Rookie Award Vote" },
    start_at: new Date(Date.now() - 86400000 * 3).toISOString(), // 3일 전
    stop_at: new Date(Date.now() - 86400000).toISOString(), // 하루 전 (종료됨)
    main_image: "https://example.com/vote2.jpg",
    wait_image: "https://example.com/wait2.jpg",
    result_image: "https://example.com/result2.jpg",
    area: "kpop",
    vote_category: "artist",
    vote_sub_category: "rookie",
    vote_content: "올해의 신인상 투표",
    visible_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    deleted_at: null,
    order: 2,
    voteItem: [
      {
        id: 3,
        vote_id: 2,
        artist_id: 3,
        group_id: 2,
        vote_total: 1500,
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        deleted_at: null,
        artist: createArtist(
          3,
          { ko: "아티스트 3", en: "Artist 3" },
          "https://example.com/artist3.jpg",
        ),
      },
      {
        id: 4,
        vote_id: 2,
        artist_id: 4,
        group_id: 2,
        vote_total: 1200,
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        deleted_at: null,
        artist: createArtist(
          4,
          { ko: "아티스트 4", en: "Artist 4" },
          "https://example.com/artist4.jpg",
        ),
      },
    ],
    voteReward: [],
  },
  {
    id: 3,
    title: { ko: "다가오는 투표", en: "Upcoming Vote" },
    start_at: new Date(Date.now() + 86400000).toISOString(), // 하루 후
    stop_at: new Date(Date.now() + 86400000 * 5).toISOString(), // 5일 후
    main_image: "https://example.com/vote3.jpg",
    wait_image: "https://example.com/wait3.jpg",
    result_image: "https://example.com/result3.jpg",
    area: "kpop",
    vote_category: "artist",
    vote_sub_category: "upcoming",
    vote_content: "곧 시작될 투표에 참여하세요",
    visible_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    deleted_at: null,
    order: 3,
    voteItem: [
      {
        id: 5,
        vote_id: 3,
        artist_id: 5,
        group_id: 3,
        vote_total: 0,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        deleted_at: null,
        artist: createArtist(
          5,
          { ko: "아티스트 5", en: "Artist 5" },
          "https://example.com/artist5.jpg",
        ),
      },
      {
        id: 6,
        vote_id: 3,
        artist_id: 6,
        group_id: 3,
        vote_total: 0,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        deleted_at: null,
        artist: createArtist(
          6,
          { ko: "아티스트 6", en: "Artist 6" },
          "https://example.com/artist6.jpg",
        ),
      },
    ],
    voteReward: [
      {
        reward_id: 2,
        vote_id: 3,
        reward: {
          id: 2,
          title: { ko: "보상 2", en: "Reward 2" },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          location: null,
          location_images: [],
          order: 2,
          overview_images: [],
          size_guide: null,
          size_guide_images: [],
          thumbnail: "https://example.com/reward2.jpg",
        },
      },
    ],
  },
];

// 빈 투표 목록
export const emptyVotes: Vote[] = [];

// 에러 상황 시뮬레이션을 위한 함수
export const mockVoteError = new Error(
  "투표 데이터를 불러오는 중 오류가 발생했습니다.",
);

// 투표 상태별 필터링 함수들
export const getVotesByStatus = (status: string) => {
  const now = new Date().toISOString();

  switch (status) {
    case "upcoming":
      return mockVotes.filter((vote) => vote.start_at && vote.start_at > now);
    case "active":
      return mockVotes.filter((vote) =>
        vote.start_at && vote.stop_at &&
        vote.start_at <= now && vote.stop_at >= now
      );
    case "ended":
      return mockVotes.filter((vote) => vote.stop_at && vote.stop_at < now);
    default:
      return mockVotes;
  }
};
