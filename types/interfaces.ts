// Auto-generated interfaces from Supabase types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BoardStatusEnum = "pending" | "approved" | "rejected";

export type CandyHistoryType = "AD" | "VOTE" | "PURCHASE" | "GIFT" | "EXPIRED" | "VOTE_SHARE_BONUS" | "OPEN_COMPATIBILITY" | "MISSION";

export type CompatibilityStatus = "pending" | "completed" | "error";

export type PlatformEnum = "iOS" | "Android" | "Both";

export type PolicyLanguageEnum = "ko" | "en";

export type ProductTypeEnum = "consumable" | "non-consumable" | "subscription";

export type SupportedLanguage = "ko" | "en" | "ja" | "zh";

export type UserGenderEnum = "male" | "female" | "other";

export interface Activities {
  activity_type: string
  description: string
  details: Json | null
  id: number
  ip_address: string | null
  resource_id: string | null
  resource_type: string
  timestamp: string
  user_agent: string | null
  user_id: string | null
}

export interface AdminPermissions {
  action: string
  created_at: string | null
  description: string | null
  id: string
  resource: string
  updated_at: string | null
}

export interface AdminRolePermissions {
  created_at: string | null
  id: string
  permission_id: string
  role_id: string
  updated_at: string | null
}

export interface AdminRoles {
  created_at: string | null
  description: string | null
  id: string
  name: string
  updated_at: string | null
}

export interface AdminUserRoles {
  created_at: string | null
  id: string
  role_id: string
  updated_at: string | null
  user_id: string
}

export interface Album {
  created_at: string | null
  deleted_at: string | null
  id: number | null
  title: string | null
  updated_at: string | null
  user_id: number | null
}

export interface AlbumImage {
  album_id: number | null
  image_id: number | null
}

export interface AlbumImageUser {
  image_id: number | null
  user_id: number | null
}

export interface AppSplash {
  created_at: string | null
  deleted_at: string | null
  duration: number | null
  end_at: string | null
  id: number
  image: Json | null
  start_at: string | null
  updated_at: string | null
}

export interface Article {
  comment_count: number | null
  content: string | null
  created_at: string | null
  deleted_at: string | null
  gallery_id: number
  id: number
  title_en: string | null
  title_ko: string | null
  updated_at: string | null
}

export interface ArticleComment {
  article_id: number | null
  childrencount: number | null
  content: string | null
  created_at: string | null
  deleted_at: string | null
  id: number | null
  likes: number | null
  parent_id: number | null
  updated_at: string | null
  user_id: number | null
}

export interface ArticleCommentLike {
  comment_id: number | null
  user_id: number | null
}

export interface ArticleCommentReport {
  comment_id: number | null
  user_id: number | null
}

export interface ArticleImage {
  article_id: number
  created_at: string | null
  deleted_at: string | null
  id: number
  image: string | null
  order: number | null
  title_en: string | null
  title_ko: string | null
  updated_at: string | null
}

export interface ArticleImageUser {
  image_id: number
  user_id: string
}

export interface Artist {
  birth_date: string | null
  created_at: string
  dd: number | null
  debut_date: string | null
  debut_dd: number | null
  debut_mm: number | null
  debut_yy: number | null
  deleted_at: string | null
  gender: string | null
  group_id: number | null
  id: number
  image: string | null
  is_kpop: boolean
  is_musical: boolean
  is_solo: boolean
  mm: number | null
  name: Json | null
  updated_at: string
  yy: number | null
  artistGroup?: ArtistGroup;
  voteItem?: VoteItem[];
}

export interface ArtistGroup {
  created_at: string
  debut_date: string | null
  debut_dd: number | null
  debut_mm: number | null
  debut_yy: number | null
  deleted_at: string | null
  id: number
  image: string | null
  name: Json | null
  updated_at: string
  artist?: Artist[];
  voteItem?: VoteItem[];
}

export interface ArtistUserBookmark {
  artist_id: number | null
  created_at: string
  deleted_at: string | null
  id: number
  updated_at: string | null
  user_id: string | null
}

export interface ArtistVote {
  category: string | null
  content: Json | null
  created_at: string | null
  deleted_at: string | null
  id: number
  start_at: string | null
  stop_at: string | null
  title: Json | null
  updated_at: string | null
  visible_at: string | null
}

export interface ArtistVoteItem {
  artist_vote_id: number | null
  created_at: string | null
  deleted_at: string | null
  description: Json | null
  id: number
  title: Json | null
  updated_at: string | null
  vote_total: number | null
}

export interface AwsdmsDdlAudit {
  c_ddlqry: string | null
  c_key: number
  c_name: string | null
  c_oid: number | null
  c_schema: string | null
  c_tag: string | null
  c_time: string | null
  c_txn: string | null
  c_user: string | null
}

export interface Banner {
  celeb_id: number | null
  created_at: string | null
  deleted_at: string | null
  duration: number | null
  end_at: string | null
  id: number
  image: Json | null
  link: string | null
  location: string | null
  order: number | null
  start_at: string | null
  thumbnail: string | null
  title: Json
  updated_at: string | null
}

export interface BatchLog {
  batch_name: string | null
  details: Json | null
  end_time: string | null
  id: number
  start_time: string | null
  status: string | null
}

export interface BlockedIps {
  blocked_at: string | null
  ip_address: string
  reason: string | null
}

export interface Boards {
  artist_id: number
  board_id: string
  created_at: string
  creator_id: string | null
  deleted_at: string | null
  description: string | null
  features: string[] | null
  id: string
  is_official: boolean | null
  name: Json
  order: number | null
  parent_board_id: string | null
  request_message: string | null
  status: BoardStatusEnum
  updated_at: string
}

export interface BonusExpiryLog {
  created_at: string | null
  details: Json | null
  id: number
  operation: string | null
}

export interface Celeb {
  created_at: string | null
  deleted_at: string | null
  id: number
  name_en: string | null
  name_ko: string | null
  thumbnail: string | null
  updated_at: string | null
}

export interface CelebBookmarkUser {
  celeb_id: number
  user_id: string | null
}

export interface CommentLikes {
  comment_id: string
  comment_like_id: string
  created_at: string
  deleted_at: string | null
  updated_at: string
  user_id: string
}

export interface CommentReports {
  comment_id: string | null
  comment_report_id: string
  created_at: string | null
  deleted_at: string | null
  reason: string | null
  updated_at: string
  user_id: string | null
}

export interface Comments {
  comment_id: string
  content: Json | null
  created_at: string
  deleted_at: string | null
  is_hidden: boolean | null
  likes: number
  locale: string | null
  parent_comment_id: string | null
  post_id: string
  replies: number
  updated_at: string
  user_id: string | null
}

export interface CompatibilityResults {
  artist_id: number
  completed_at: string | null
  created_at: string
  details: Json | null
  error_message: string | null
  gender: UserGenderEnum | null
  id: string
  idol_birth_date: string
  is_ads: boolean | null
  is_paid: boolean
  paid_at: string | null
  score: number | null
  status: CompatibilityStatus
  tips: Json | null
  user_birth_date: string
  user_birth_time: string | null
  user_id: string
}

export interface CompatibilityResultsI18n {
  compatibility_id: string
  compatibility_summary: string | null
  created_at: string
  details: Json | null
  id: string
  language: SupportedLanguage
  score: number | null
  score_title: string | null
  tips: Json | null
  updated_at: string
}

export interface CompatibilityScoreDescriptions {
  score: number | null
  summary_en: string
  summary_ja: string
  summary_ko: string
  summary_zh: string
  title_en: string | null
  title_ja: string | null
  title_ko: string | null
  title_zh: string | null
}

export interface Config {
  created_at: string | null
  id: string | null
  key: string
  updated_at: string
  value: string | null
}

export interface CountryInfo {
  country_code: string
  country_name: string
  gdp: number | null
  last_updated: string | null
  population: number | null
}

export interface CronLogs {
  created_at: string
  ended_at: string | null
  id: number
  job_name: string
  log_message: string | null
  started_at: string
  status: string | null
}

export interface CustomLogs {
  details: Json | null
  log_id: number
  log_time: string | null
  operation: string | null
}

export interface DebugDbLogs {
  detail: Json | null
  function_name: string
  id: number
  log_time: string | null
  step: string | null
}

export interface DebugLogs {
  created_at: string | null
  id: number
  log_message: string | null
}

export interface DeviceBans {
  banned_at: string | null
  banned_by: string | null
  created_at: string | null
  device_id: string | null
  id: string
  reason: string | null
  unbanned_at: string | null
}

export interface Devices {
  app_build_number: string | null
  app_version: string | null
  ban_reason: string | null
  banned_at: string | null
  created_at: string | null
  device_id: string
  device_info: Json | null
  is_banned: boolean | null
  last_ip: string | null
  last_seen: string | null
  last_updated: string | null
  user_id: string | null
}

export interface Faqs {
  answer: Json
  category: string | null
  created_at: string | null
  created_by: string | null
  id: number
  order_number: number | null
  question: Json
  status: string | null
  updated_at: string | null
}

export interface FortuneBatchLog {
  completed_at: string | null
  created_at: string | null
  failed_count: number | null
  id: number
  processed_count: number | null
  status: string | null
  total_artists: number | null
  year: number | null
}

export interface FortuneGenerationLog {
  artist_id: number | null
  created_at: string | null
  error_message: string | null
  id: number
  status: string | null
  year: number | null
}

export interface FortuneTelling {
  advice: string[]
  artist_id: number
  aspects: Json
  created_at: string | null
  id: string
  lucky: Json
  monthly_fortunes: Json
  overall_luck: string
  updated_at: string | null
  year: number
}

export interface FortuneTellingI18n {
  advice: string[]
  artist_id: number
  aspects: Json
  created_at: string | null
  fortune_id: string
  id: string
  language: string
  lucky: Json
  monthly_fortunes: Json
  overall_luck: string
  updated_at: string | null
  year: number
}

export interface Gallery {
  celeb_id: number
  cover: string | null
  created_at: string
  deleted_at: string | null
  id: number
  title: Json | null
  title_en: string | null
  title_ko: string | null
  updated_at: string
}

export interface GalleryUser {
  gallery_id: number | null
  user_id: number | null
}

export interface IpCountryMapping {
  country_code: string
  id: number
  ip_range_end: number
  ip_range_start: number
  last_updated: string | null
}

export interface Library {
  created_at: string | null
  deleted_at: string | null
  id: number | null
  title: string | null
  updated_at: string | null
  user_id: number | null
}

export interface LibraryImage {
  image_id: number | null
  library_id: number | null
}

export interface Media {
  created_at: string
  deleted_at: string | null
  id: number
  thumbnail_url: string | null
  title: Json | null
  updated_at: string
  video_id: string | null
  video_url: string | null
}

export interface Notices {
  content: Json
  created_at: string | null
  created_by: string | null
  id: number
  is_pinned: boolean | null
  status: string | null
  title: Json
  updated_at: string | null
}

export interface PartitionCreationLog {
  created_at: string | null
  id: number
  message: string | null
}

export interface Permissions {
  action: string
  created_at: string | null
  description: string | null
  id: string
  resource: string
  updated_at: string | null
}

export interface PicVote {
  area: string | null
  created_at: string
  deleted_at: string | null
  id: number
  main_image: string | null
  order: number | null
  result_image: string | null
  start_at: string | null
  stop_at: string | null
  title: Json | null
  updated_at: string
  visible_at: string | null
  vote_category: string | null
  vote_content: string | null
  wait_image: string | null
}

export interface PicVoteItem {
  artist_id: number | null
  created_at: string | null
  deleted_at: string | null
  group_id: number | null
  id: number
  updated_at: string | null
  vote_id: number | null
  vote_total: number | null
}

export interface PicVotePick {
  amount: number | null
  created_at: string | null
  deleted_at: string | null
  id: number
  updated_at: string | null
  user_id: string | null
  vote_id: number | null
  vote_item_id: number
}

export interface PicVoteReward {
  reward_id: number
  vote_id: number
}

export interface Policy {
  content: string
  created_at: string
  deleted_at: string | null
  id: number
  language: PolicyLanguageEnum | null
  type: string | null
  updated_at: string
  version: string
}

export interface Popup {
  content: Json | null
  created_at: string | null
  deleted_at: string | null
  id: number
  image: Json | null
  platform: string | null
  start_at: string | null
  stop_at: string | null
  title: Json | null
  updated_at: string | null
}

export interface PostAttachments {
  attachment_id: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string
  post_id: string | null
}

export interface PostReports {
  created_at: string | null
  deleted_at: string | null
  post_id: string | null
  post_report_id: string
  reason: string | null
  updated_at: string
  user_id: string | null
}

export interface PostScraps {
  created_at: string | null
  deleted_at: string | null
  post_id: string | null
  post_scrap_id: string
  updated_at: string
  user_id: string
}

export interface PostViews {
  post_id: string
  user_id: string
  viewed_at: string | null
}

export interface Posts {
  attachments: string[] | null
  board_id: string | null
  content: Json[] | null
  created_at: string
  deleted_at: string | null
  id: string
  is_anonymous: boolean
  is_hidden: boolean | null
  is_temporary: boolean
  post_id: string
  reply_count: number
  title: string
  updated_at: string | null
  user_id: string
  view_count: number
}

export interface Products {
  created_at: string | null
  description: Json | null
  end_at: string | null
  id: string
  paypal_link: string | null
  platform: PlatformEnum
  price: number | null
  product_name: string
  product_type: ProductTypeEnum
  star_candy: number | null
  star_candy_bonus: number | null
  start_at: string | null
}

export interface PromptUsageLogs {
  created_at: string | null
  error: string | null
  execution_time_ms: number | null
  id: string
  prompt_id: string | null
  response: Json
  token_count: number | null
  variables: Json
}

export interface Prompts {
  category: string
  created_at: string | null
  created_by: string
  description: string | null
  id: string
  is_active: boolean | null
  model_config: Json
  name: string
  tags: string[] | null
  template: string
  updated_at: string | null
  variables: string[]
  version: number
}

export interface Qnas {
  answer: string | null
  answered_at: string | null
  answered_by: string | null
  created_at: string | null
  created_by: string | null
  is_private: boolean | null
  qna_id: number
  question: string
  status: string | null
  title: string
  updated_at: string | null
}

export interface Receipts {
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
}

export interface Reward {
  created_at: string
  deleted_at: string | null
  id: number
  location: Json | null
  location_images: string[] | null
  order: number | null
  overview_images: string[] | null
  size_guide: Json | null
  size_guide_images: string[] | null
  thumbnail: string | null
  title: Json | null
  updated_at: string
  voteReward?: VoteReward[];
  voteAchieve?: VoteAchieve[];
}

export interface RolePermissions {
  created_at: string | null
  id: string
  permission_id: string
  role_id: string
  updated_at: string | null
}

export interface RoleUsers {
  created_at: string | null
  id: string
  role_id: string
  updated_at: string | null
  user_id: string
}

export interface Roles {
  created_at: string | null
  description: string | null
  id: string
  name: string
  updated_at: string | null
}

export interface StarCandyBonusHistory {
  amount: number | null
  created_at: string
  deleted_at: string | null
  expired_dt: string | null
  id: number
  parent_id: number | null
  remain_amount: number
  transaction_id: string | null
  type: CandyHistoryType | null
  updated_at: string
  user_id: string
  vote_pick_id: number | null
}

export interface StarCandyHistory {
  amount: number | null
  created_at: string
  deleted_at: string | null
  id: number
  parent_id: number | null
  transaction_id: string | null
  type: CandyHistoryType | null
  updated_at: string
  user_id: string
  vote_pick_id: number | null
}

export interface TransactionAdmob {
  ad_network: string | null
  created_at: string
  deleted_at: string | null
  key_id: string | null
  reward_amount: number | null
  reward_type: string | null
  signature: string | null
  transaction_id: string
  updated_at: string
  user_id: string | null
}

export interface TransactionPangle {
  ad_network: string | null
  created_at: string
  deleted_at: string | null
  key_id: string | null
  platform: string | null
  reward_amount: number | null
  reward_name: string | null
  reward_type: string | null
  signature: string | null
  transaction_id: string
  updated_at: string
  user_id: string | null
}

export interface TransactionPincrux {
  ad_network: string | null
  app_key: string | null
  app_title: string | null
  commission: number | null
  created_at: string
  deleted_at: string | null
  menu_category1: string | null
  pub_key: number | null
  reward_amount: number | null
  reward_type: string | null
  signature: string | null
  transaction_id: string
  updated_at: string
  usr_key: string | null
}

export interface TransactionTapjoy {
  created_at: string
  id: number
  platform: string | null
  reward_amount: number
  reward_type: string | null
  transaction_id: string
  user_id: string
  verifier: string | null
}

export interface TransactionUnity {
  ad_network: string | null
  created_at: string
  deleted_at: string | null
  hmac: string
  reward_amount: number | null
  reward_type: string | null
  transaction_id: string
  updated_at: string
  user_id: string
}

export interface UserAgreement {
  created_at: string | null
  deleted_at: string | null
  id: string
  privacy: string | null
  terms: string | null
  updated_at: string | null
}

export interface UserBlocks {
  blocked_user_id: string
  created_at: string
  deleted_at: string | null
  id: string
  user_id: string
}

export interface UserCommentLike {
  comment_id: number | null
  created_at: string | null
  deleted_at: string | null
  id: number | null
  updated_at: string | null
  user_id: number | null
}

export interface UserCommentReport {
  comment_id: number | null
  created_at: string | null
  deleted_at: string | null
  id: number | null
  updated_at: string | null
  user_id: number | null
}

export interface UserProfiles {
  avatar_url: string | null
  birth_date: string | null
  birth_time: string | null
  created_at: string
  deleted_at: string | null
  email: string | null
  gender: UserGenderEnum | null
  id: string
  is_admin: boolean
  nickname: string | null
  open_ages: boolean
  open_gender: boolean
  star_candy: number
  star_candy_bonus: number
  updated_at: string
  votePick?: VotePick[];
  voteComment?: VoteComment[];
  voteCommentLike?: VoteCommentLike[];
  voteCommentReport?: VoteCommentReport[];
  voteShareBonus?: VoteShareBonus[];
}

export interface UserRoles {
  created_at: string | null
  id: string
  role_id: string
  updated_at: string | null
  user_id: string
}

export interface Version {
  android: Json | null
  created_at: string
  deleted_at: string | null
  id: number
  ios: Json | null
  linux: Json | null
  macos: Json | null
  updated_at: string
  windows: Json | null
}

export interface Vote {
  area: string
  created_at: string
  deleted_at: string | null
  id: number
  main_image: string | null
  order: number | null
  result_image: string | null
  start_at: string | null
  stop_at: string | null
  title: Json | null
  updated_at: string
  visible_at: string | null
  vote_category: string | null
  vote_content: string | null
  vote_sub_category: string | null
  wait_image: string | null
  voteItem?: VoteItem[];
  votePick?: VotePick[];
  voteComment?: VoteComment[];
  voteReward?: VoteReward[];
  voteShareBonus?: VoteShareBonus[];
  voteAchieve?: VoteAchieve[];
}

export interface VoteAchieve {
  amount: number | null
  id: number | null
  order: number | null
  reward_id: number | null
  vote_id: number | null
  vote?: Vote;
  reward?: Reward;
}

export interface VoteComment {
  childrencount: number | null
  content: string | null
  created_at: string | null
  deleted_at: string | null
  id: number | null
  likes: number | null
  parent_id: number | null
  updated_at: string | null
  user_id: number | null
  vote_id: number | null
  vote?: Vote;
  userProfiles?: UserProfiles;
  voteCommentLike?: VoteCommentLike[];
  voteCommentReport?: VoteCommentReport[];
}

export interface VoteCommentLike {
  comment_id: number | null
  user_id: number | null
  voteComment?: VoteComment;
  userProfiles?: UserProfiles;
}

export interface VoteCommentReport {
  comment_id: number | null
  user_id: number | null
  voteComment?: VoteComment;
  userProfiles?: UserProfiles;
}

export interface VoteItem {
  artist_id: number | null
  created_at: string | null
  deleted_at: string | null
  group_id: number
  id: number
  updated_at: string | null
  vote_id: number | null
  vote_total: number | null
  vote?: Vote;
  artist?: Artist;
  artistGroup?: ArtistGroup;
}

export interface VotePick {
  amount: number | null
  created_at: string | null
  deleted_at: string | null
  id: number
  updated_at: string | null
  user_id: string | null
  vote_id: number | null
  vote_item_id: number
  vote?: Vote;
  voteItem?: VoteItem;
  userProfiles?: UserProfiles;
}

export interface VoteReward {
  reward_id: number
  vote_id: number
  vote?: Vote;
  reward?: Reward;
}

export interface VoteShareBonus {
  amount: number
  created_at: string
  id: number
  updated_at: string
  user_id: string
  vote_id: number
  vote?: Vote;
  userProfiles?: UserProfiles;
}

export interface ViewTransactionAll {
  ad_network: string | null
  commission: number | null
  created_at: string | null
  platform: string | null
  reward_amount: number | null
  reward_name: string | null
  reward_type: string | null
  source: string | null
  transaction_id: string | null
  user_id: string | null
}