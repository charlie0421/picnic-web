// Auto-generated interfaces from Supabase types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BoardStatus = "pending" | "approved" | "rejected";

export type CandyHistoryType = "AD" | "VOTE" | "PURCHASE" | "GIFT" | "EXPIRED" | "VOTE_SHARE_BONUS" | "OPEN_COMPATIBILITY" | "MISSION";

export type CompatibilityStatus = "pending" | "completed" | "error";

export type PlatformEnum = "iOS" | "Android" | "Both";

export type PolicyLanguageEnum = "ko" | "en";

export type PolicyType = "PRIVACY_KO" | "PRIVACY_EN" | "TERMS_KO" | "TERMS_EN" | "WITHDRAW_ACCOUNT_KO" | "WITHDRAW_ACCOUNT_EN";

export type PortalEnum = "vote" | "pic";

export type ProductType = "consumable" | "non-consumable" | "subscription";

export type SpecificPlatformEnum = "iOS" | "Android";

export type SupportedLanguageEnum = "ko" | "en" | "ja" | "zh";

export type SupportedLanguage = SupportedLanguageEnum;

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

export interface AdminWhitelist {
  created_at: string | null
  created_by: string | null
  email: string
  id: string
  is_active: boolean | null
  notes: string | null
  updated_at: string | null
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

export interface ApplicationLogs {
  browser_name: string | null
  category: string
  created_at: string
  data: string | null
  environment: string | null
  id: string
  level: string
  line_number: number | null
  message: string
  platform: string | null
  request_id: string | null
  session_id: string | null
  source_file: string | null
  stack_trace: string | null
  timestamp: string
  user_id: string | null
}

export interface Article {
  comment_count: number | null
  content: string | null
  created_at: string | null
  deleted_at: string | null
  gallery_id: number
  id: number
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
  is_partnership: boolean | null
  is_solo: boolean
  mm: number | null
  name: Json | null
  partner: string | null
  partner_data: string | null
  updated_at: string
  yy: number | null
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

export interface AuditLogs {
  action_description: string
  action_type: string
  changed_fields: string | null
  classification: string | null
  created_at: string
  error_message: string | null
  id: string
  ip_address: string | null
  metadata: string | null
  method: string | null
  new_values: string | null
  old_values: string | null
  resource_id: string | null
  resource_name: string | null
  resource_type: string
  retention_period: number | null
  session_id: string | null
  severity: string
  status_code: number | null
  success: boolean
  tags: string | null
  timestamp: string
  updated_at: string
  url: string | null
  user_agent: string | null
  user_email: string | null
  user_id: string | null
  user_roles: string | null
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
  link_target_id: number | null
  link_type: string | null
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
  status: BoardStatus
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
  language: SupportedLanguageEnum
  score: number | null
  score_title: string | null
  tips: Json | null
  updated_at: string
}

export interface CompatibilityScoreDescriptions {
  score: number | null
  summary_ja: string
  summary_ko: string
  summary_zh: string
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

export interface FaqCategories {
  active: boolean
  code: string
  created_at: string
  label: Json
  order_number: number
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
  product_type: ProductType
  star_candy: number | null
  star_candy_bonus: number | null
  start_at: string | null
  web_bonus_amount: number | null
  web_description: string | null
  web_display_order: number | null
  web_is_featured: boolean | null
  web_price_krw: number | null
  web_price_usd: number | null
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

export interface QnaAttachments {
  created_at: string | null
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  id: number
  message_id: number | null
}

export interface QnaMessages {
  content: string | null
  created_at: string | null
  id: number
  is_admin_message: boolean | null
  thread_id: number | null
  user_id: string | null
}

export interface QnaThreads {
  created_at: string | null
  id: number
  status: string | null
  title: string
  updated_at: string | null
  user_id: string | null
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
  tx_key: string | null
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
  type: string | null
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
  platform: string | null
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
  is_super_admin: boolean | null
  jma_candy: number | null
  nickname: string | null
  open_ages: boolean
  open_gender: boolean
  star_candy: number
  star_candy_bonus: number
  updated_at: string
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
  apk: Json | null
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
  is_partnership: boolean | null
  main_image: string | null
  order: number | null
  partner: string | null
  result_image: string | null
  star_candy_bonus_total: number | null
  star_candy_total: number | null
  start_at: string | null
  stop_at: string | null
  title: Json | null
  updated_at: string
  visible_at: string | null
  vote_category: string | null
  vote_content: string | null
  vote_sub_category: string | null
  vote_total: number | null
  wait_image: string | null
}

export interface VoteAchieve {
  amount: number | null
  id: number | null
  order: number | null
  reward_id: number | null
  vote_id: number | null
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
}

export interface VoteCommentLike {
  comment_id: number | null
  user_id: number | null
}

export interface VoteCommentReport {
  comment_id: number | null
  user_id: number | null
}

export interface VoteItem {
  artist_id: number | null
  created_at: string | null
  deleted_at: string | null
  group_id: number
  id: number
  star_candy_bonus_total: number
  star_candy_total: number
  updated_at: string | null
  vote_id: number | null
  vote_total: number | null
}

export interface VoteItemRequestUsers {
  artist_id: number
  created_at: string | null
  id: string
  status: string
  updated_at: string | null
  user_id: string
  vote_id: number
  vote_item_request_id: string
}

export interface VoteItemRequestsBackup {
  created_at: string | null
  id: string
  status: string
  updated_at: string | null
  vote_id: number
}

export interface VotePick {
  amount: number | null
  created_at: string | null
  deleted_at: string | null
  id: number
  star_candy_bonus_usage: number
  star_candy_usage: number
  updated_at: string | null
  user_id: string | null
  vote_id: number | null
  vote_item_id: number
}

export interface VoteReward {
  reward_id: number
  vote_id: number
}

export interface VoteShareBonus {
  amount: number
  created_at: string
  id: number
  updated_at: string
  user_id: string
  vote_id: number
}

export interface ArtistRequestStatistics {
  approved_requests: number | null
  artist_group: string | null
  artist_id: number | null
  artist_image: string | null
  artist_name: string | null
  first_request_at: string | null
  last_updated_at: string | null
  pending_requests: number | null
  rejected_requests: number | null
  total_requests: number | null
}

export interface AuditLogStats {
  action_type: string | null
  log_count: number | null
  log_date: string | null
  resource_type: string | null
  severity: string | null
  success: boolean | null
  unique_users: number | null
}

export interface SecurityEventsSummary {
  action_type: string | null
  affected_users: number | null
  event_count: number | null
  event_date: string | null
  severity: string | null
  unique_ips: number | null
}

export interface UserActivitySummary {
  activity_date: string | null
  failed_actions: number | null
  first_activity: string | null
  last_activity: string | null
  total_actions: number | null
  unique_action_types: number | null
  user_email: string | null
  user_id: string | null
}

export interface UserVoteItemRequestHistory {
  artist_group: string | null
  artist_id: number | null
  artist_image: string | null
  artist_name: string | null
  request_status: string | null
  request_status_text: string | null
  requested_at: string | null
  status_updated_at: string | null
  user_id: string | null
  vote_id: number | null
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

export interface ViewUserActivityUnified {
  ad_network: string | null
  ad_reward_name: string | null
  ad_source: string | null
  amount: number | null
  artist_name: Json | null
  bonus_gain: number | null
  created_at: string | null
  expired_dt: string | null
  receipt_environment: string | null
  receipt_platform: string | null
  receipt_product_id: string | null
  receipt_status: string | null
  remain_amount: number | null
  source: string | null
  star_gain: number | null
  subtype: string | null
  transaction_id: string | null
  unified_id: string | null
  user_id: string | null
  vote_item_name: Json | null
  vote_item_title: Json | null
  vote_pick_id: number | null
  vote_title: Json | null
}

export interface ViewUserCandyLedger {
  ad_network: string | null
  balance: number | null
  bonus_amount: number | null
  category: string | null
  created_at: string | null
  detail: string | null
  name: string | null
  star_amount: number | null
  transaction_id: string | null
  user_id: string | null
}

export interface VoteItemRequestStatusSummary {
  artist_group: string | null
  artist_id: number | null
  artist_name: string | null
  first_request_at: string | null
  last_updated_at: string | null
  request_count: number | null
  request_status: string | null
  vote_id: number | null
}

export interface VoteItemRequests {
  artist: Json | null
  artist_id: number | null
  created_at: string | null
  id: string | null
  status: string | null
  updated_at: string | null
  user_id: string | null
  vote_id: number | null
}