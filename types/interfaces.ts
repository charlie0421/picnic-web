// Auto-generated interfaces from Supabase types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BoardStatus = "pending" | "approved" | "rejected";

export type CandyHistoryType = "AD" | "VOTE" | "PURCHASE" | "GIFT" | "EXPIRED" | "VOTE_SHARE_BONUS" | "OPEN_COMPATIBILITY" | "MISSION" | "OPEN_GOONGHAP" | "ADMIN_ADJUST";

export type GoonghapStatus = "pending" | "completed" | "error";

export type PlatformEnum = "iOS" | "Android" | "Both";

export type PolicyLanguageEnum = "ko" | "en";

export type PolicyType = "PRIVACY_KO" | "PRIVACY_EN" | "TERMS_KO" | "TERMS_EN" | "WITHDRAW_ACCOUNT_KO" | "WITHDRAW_ACCOUNT_EN";

export type PortalEnum = "vote" | "pic";

export type ProductType = "consumable" | "non-consumable" | "subscription";

export type QnaStatus = "RECEIVED" | "IN_PROGRESS" | "RESOLVED";

export type SpecificPlatformEnum = "iOS" | "Android";

export type SupportedLanguageEnum = "ko" | "en" | "ja" | "zh" | "zh-CN" | "zh-TW" | "fil" | "id" | "th" | "vi" | "es" | "bn" | "my";

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

export interface AdCampaigns {
  advertiser: string | null
  created_at: string | null
  cta_url: string | null
  id: string
  is_default: boolean
  reward_comment: number
  reward_like: number
  reward_more: number
  reward_subscribe: number
  reward_view: number
  served_count: number
  status: string
  title: string
  total_cap: number | null
  updated_at: string | null
  video_key: string
  visible_from: string | null
  visible_to: string | null
  weight: number
}

export interface AdImpressions {
  ad_id: string
  completed_at: string | null
  created_at: string | null
  id: string
  ip_hash: string | null
  issue_expires_at: string | null
  issue_jti: string | null
  issued_at: string
  more_completed_at: string | null
  more_reward_granted_at: string | null
  user_agent: string | null
  user_id: string
  view_reward_granted_at: string | null
}

export interface AdRewardEvents {
  ad_id: string
  amount: number
  created_at: string | null
  id: string
  impression_id: string
  type: string
  user_id: string
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
  id: number
  title: string | null
  updated_at: string | null
  user_id: number | null
}

export interface AlbumImage {
  album_id: number
  image_id: number
}

export interface AlbumImageUser {
  image_id: number
  user_id: number
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
  id_old: string
  level: string
  line_number: number | null
  message: string
  platform: string | null
  request_id: string | null
  rid: string
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
  id: number
  likes: number | null
  parent_id: number | null
  updated_at: string | null
  user_id: number | null
}

export interface ArticleCommentLike {
  comment_id: number
  user_id: number
}

export interface ArticleCommentReport {
  comment_id: number
  user_id: number
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

export interface AttendanceCheck {
  check_date: string
  created_at: string
  id: number
  reward_amount: number
  user_id: string
  weekly_bonus_amount: number
}

export interface AuditLogs {
  action_description: string
  action_type: string
  changed_fields: string | null
  classification: string | null
  created_at: string
  error_message: string | null
  id: string
  id_old: string
  ip_address: string | null
  metadata: string | null
  method: string | null
  new_values: string | null
  old_values: string | null
  resource_id: string | null
  resource_name: string | null
  resource_type: string
  retention_period: number | null
  rid: string
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
  id: number
  ip_address: string
  reason: string | null
  rid: string
}

export interface BoardUserBookmark {
  board_id: string
  created_at: string
  id: string
  user_id: string
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

export interface BroadcastNotifications {
  action_url: string | null
  body: string
  created_at: string
  created_by: string | null
  data: Json | null
  id: number
  title: string
  type: string
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
  user_id: string
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
  comment_id: string
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
  id: number
  is_banned: boolean | null
  last_ip: string | null
  last_seen: string | null
  last_updated: string | null
  rid: string
  user_id: string | null
}

export interface FaqCategories {
  active: boolean
  code: string
  created_at: string
  id: number
  label: Json
  order_number: number
  rid: string
}

export interface Faqs {
  answer: Json
  answer_delta: Json | null
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

export interface FunctionRequestLog {
  code: number | null
  function_name: string
  id: number
  ip: string | null
  meta: Json | null
  ok: boolean | null
  reason: string | null
  ts: string
  user_id: string | null
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
  gallery_id: number
  user_id: number
}

export interface GoonghapResults {
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
  status: GoonghapStatus
  tips: Json | null
  user_birth_date: string
  user_birth_time: string | null
  user_id: string
}

export interface GoonghapResultsI18n {
  created_at: string
  details: Json | null
  goonghap_id: string
  goonghap_summary: string | null
  id: string
  language: string
  score: number | null
  score_title: string | null
  tips: Json | null
  updated_at: string
}

export interface GoonghapScoreDescriptions {
  score: number
  summary_ja: string
  summary_ko: string
  summary_zh: string
  title_ja: string | null
  title_ko: string | null
  title_zh: string | null
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
  id: number
  title: string | null
  updated_at: string | null
  user_id: number | null
}

export interface LibraryImage {
  image_id: number
  library_id: number
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

export interface PocapopBaseFrames {
  category: string
  color_tone: string | null
  created_at: string | null
  generation_type: string | null
  id: string
  name: string
  png_url: string
  thumbnail_url: string
}

export interface PocapopCategories {
  created_at: string | null
  id: string
  is_active: boolean | null
  labels: Json
  name: string
  sort_order: number | null
}

export interface PocapopCommunityComments {
  content: string
  created_at: string
  id: string
  parent_comment_id: string | null
  post_id: string
  updated_at: string
  user_id: string
}

export interface PocapopCommunityLikes {
  created_at: string
  id: string
  post_id: string
  user_id: string
}

export interface PocapopCommunityPosts {
  artist_tags: string[] | null
  auto_shared: boolean | null
  country: string | null
  created_at: string | null
  frame_id: string
  id: string
  nickname: string
  thumbnail_url: string
  user_id: string
}

export interface PocapopCouponRedemptions {
  coupon_id: string
  id: string
  redeemed_at: string | null
  trial_count_added: number
  user_id: string
}

export interface PocapopCoupons {
  code: string
  created_at: string | null
  current_uses: number | null
  expires_at: string | null
  id: string
  is_active: boolean | null
  max_uses: number | null
  trial_count: number
}

export interface PocapopDownloadLogs {
  download_type: string
  downloaded_at: string | null
  frame_id: string | null
  id: string
  user_id: string | null
}

export interface PocapopFramePurchases {
  frame_id: string
  id: string
  price_paid: number
  purchased_at: string
  user_id: string
}

export interface PocapopHdDownloadCounts {
  count: number | null
  date: string
  id: string
  updated_at: string | null
  user_id: string
}

export interface PocapopMarketFrames {
  category: string | null
  created_at: string
  creator_id: string
  description: string | null
  id: string
  image_url: string
  price_star_candy: number | null
  status: string | null
  tags: string[] | null
  title: string
  updated_at: string
}

export interface PocapopReports {
  comment_id: string | null
  created_at: string | null
  id: string
  post_id: string | null
  reason: string | null
  report_type: string
  reported_user_id: string | null
  reporter_id: string
  status: string | null
  updated_at: string | null
}

export interface PocapopUserBlocks {
  blocked_id: string
  blocker_id: string
  created_at: string | null
  id: string
}

export interface PocapopUserFrames {
  artist_name: string
  base_frame_id: string | null
  concept_keywords: string[] | null
  created_at: string | null
  frame_type: string | null
  hd_image_url: string
  id: string
  poka_size: string | null
  sd_image_url: string
  user_id: string | null
}

export interface PocapopUserSubscriptions {
  created_at: string | null
  id: string
  pro_trial_count: number | null
  subscription_expires_at: string | null
  subscription_type: string | null
  updated_at: string | null
  user_id: string
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

export interface PostLikes {
  created_at: string
  post_id: string
  user_id: string
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
  rid: string
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

export interface PushMessages {
  body: string
  created_at: string | null
  created_by: string | null
  data: Json | null
  failure_count: number | null
  id: number
  platform: string | null
  success_count: number | null
  target_type: string
  target_user_ids: string[] | null
  title: string
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

export interface QnaCategories {
  active: boolean
  answer_template: Json | null
  code: string
  created_at: string
  label: Json
  order_number: number
  question_template: Json | null
  rid: string
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
  category_code: string | null
  created_at: string | null
  id: number
  status: QnaStatus | null
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
  reference_id: string | null
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
  id: number
  key_id: string | null
  reward_amount: number | null
  reward_type: string | null
  rid: string
  signature: string | null
  transaction_id: string
  updated_at: string
  user_id: string | null
}

export interface TransactionInternal {
  action: string
  ad_campaign_id: string | null
  created_at: string
  id: string
  platform: string
  reward_amount: number
  reward_type: string
  user_id: string
}

export interface TransactionPangle {
  ad_network: string | null
  created_at: string
  deleted_at: string | null
  id: number
  key_id: string | null
  platform: string | null
  reward_amount: number | null
  reward_name: string | null
  reward_type: string | null
  rid: string
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
  id: number
  menu_category1: string | null
  pub_key: number | null
  reward_amount: number | null
  reward_type: string | null
  rid: string
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
  id: number
  platform: string | null
  reward_amount: number | null
  reward_type: string | null
  rid: string
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

export interface UserBonusQueueAudit {
  deleted_at: string
  note: string | null
  source: string | null
  user_id: string
}

export interface UserBonusUpdateQueue {
  attempts: number
  created_at: string
  id: number
  last_enqueued_at: string
  last_error: string | null
  last_source: string | null
  next_run_at: string
  updated_at: string
  user_id: string
}

export interface UserCommentLike {
  comment_id: number | null
  created_at: string | null
  deleted_at: string | null
  id: number
  updated_at: string | null
  user_id: number | null
}

export interface UserCommentReport {
  comment_id: number | null
  created_at: string | null
  deleted_at: string | null
  id: number
  updated_at: string | null
  user_id: number | null
}

export interface UserCountryEvents {
  country_code: string
  created_at: string
  id: string
  source: string
  user_id: string
}

export interface UserNotifications {
  action_url: string | null
  body: string
  created_at: string
  data: Json | null
  id: number
  is_read: boolean
  read_at: string | null
  title: string
  type: string
  user_id: string
}

export interface UserProfiles {
  avatar_url: string | null
  birth_date: string | null
  birth_time: string | null
  country_code: string | null
  created_at: string
  deleted_at: string | null
  email: string | null
  gender: UserGenderEnum | null
  id: string
  is_admin: boolean
  is_super_admin: boolean | null
  jma_candy: number | null
  language: string | null
  last_ip: string | null
  nickname: string | null
  open_ages: boolean
  open_gender: boolean
  star_candy: number
  star_candy_bonus: number
  updated_at: string
}

export interface UserPushTokens {
  created_at: string | null
  device_locale: string | null
  id: number
  token_android: string | null
  token_ios: string | null
  token_macos: string | null
  token_web: string | null
  token_windows: string | null
  updated_at: string | null
  user_id: string
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
  areas: string[] | null
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
  id: number
  order: number | null
  reward_id: number | null
  vote_id: number | null
}

export interface VoteComment {
  childrencount: number | null
  content: string | null
  created_at: string | null
  deleted_at: string | null
  id: number
  likes: number | null
  parent_id: number | null
  updated_at: string | null
  user_id: number | null
  vote_id: number | null
}

export interface VoteCommentLike {
  comment_id: number
  user_id: number
}

export interface VoteCommentReport {
  comment_id: number
  user_id: number
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

export interface VoteItemUpdateQueue {
  created_at: string
  delta_amount: number
  delta_bonus: number
  delta_star: number
  id: number
  vote_item_id: number
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

export interface AdCampaignsActive {
  advertiser: string | null
  created_at: string | null
  cta_url: string | null
  id: string | null
  is_default: boolean | null
  reward_comment: number | null
  reward_like: number | null
  reward_more: number | null
  reward_subscribe: number | null
  reward_view: number | null
  served_count: number | null
  status: string | null
  title: string | null
  total_cap: number | null
  updated_at: string | null
  video_key: string | null
  visible_from: string | null
  visible_to: string | null
  weight: number | null
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

export interface CompatibilityResults {
  artist_id: number | null
  completed_at: string | null
  created_at: string | null
  details: Json | null
  error_message: string | null
  gender: UserGenderEnum | null
  id: string | null
  idol_birth_date: string | null
  is_ads: boolean | null
  is_paid: boolean | null
  paid_at: string | null
  score: number | null
  status: GoonghapStatus | null
  tips: Json | null
  user_birth_date: string | null
  user_birth_time: string | null
  user_id: string | null
}

export interface CompatibilityResultsI18n {
  compatibility_id: string | null
  compatibility_summary: string | null
  created_at: string | null
  details: Json | null
  id: string | null
  language: string | null
  score: number | null
  score_title: string | null
  tips: Json | null
  updated_at: string | null
}

export interface CompatibilityScoreDescriptions {
  score: number | null
  summary_ja: string | null
  summary_ko: string | null
  summary_zh: string | null
  title_ja: string | null
  title_ko: string | null
  title_zh: string | null
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
  ad_campaign_id: string | null
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

export interface ViewTransactionAllBase {
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

export interface VwStarCandyBonusDrift {
  delta: number | null
  history_bonus: number | null
  last_history_at: string | null
  profile_bonus: number | null
  user_id: string | null
}