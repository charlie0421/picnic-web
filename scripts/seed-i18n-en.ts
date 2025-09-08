/*
  Seed English values for keys whose values equal their key names.
  - Updates en.json only
  - Provides human-friendly default phrases for known keys
  - For unknown keys, leaves as-is (no change)
*/
import fs from 'fs';
import path from 'path';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');
const enPath = path.join(localesDir, 'en.json');

function setByPath(obj: any, pathStr: string, value: string) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function getByPath(obj: any, pathStr: string): any {
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur == null) return cur;
  }
  return cur;
}

const SEED_MAP: Record<string, string> = {
  'label_no_comments_yet': 'No comments yet',
  'label_write_first_comment': 'Write the first comment',
  'label_total_comments_count': 'Total comments',
  'label_total_likes': 'Total likes',
  'label_most_active_board': 'Most active board',
  'label_board_description': 'Board description',
  'label_anonymous': 'Anonymous',
  'label_total_posts_count': 'Total posts',
  'label_total_views': 'Total views',
  'label_total_comments': 'Total comments',
  'dialog_button_close': 'Close',
  'Mypage.notice_not_found': 'My Page not found',
  'dialog.login_required.title': 'Login required',
  'dialog.login_required.description': 'You need to log in to use this feature.',
  'dialog.login_required.login_button': 'Login',
  'dialog.login_required.cancel_button': 'Cancel',
  'dialog.action.confirm_button': 'Confirm',
  'dialog.action.cancel_button': 'Cancel',
  'dialog.action.loading': 'Loading...',
  'dialog.alert.confirm_button': 'OK',
  'dialog.confirm.confirm_button': 'Confirm',
  'dialog.confirm.cancel_button': 'Cancel',
  'dialog.confirm.loading': 'Loading...',
  'return_to_login': 'Return to login',
  'unknown_login_error': 'Unknown login error',
  'media_no_title': 'No title',
  'media_no_items': 'No items',
  'media_no_items_description': 'There are no items to display.',
  'vote_status_closed': 'Closed',
  'artist_name_fallback': 'Artist',
  'vote_login_required_description_with_artist': 'Please log in to use this feature',
  'vote_error_general': 'An error occurred. Please try again.',
  'vote_button_completed': 'Completed',
  'vote_button_voting': 'Voting...',
  'vote_button_vote': 'Vote',
  'vote_button_login_to_vote': 'Login to vote',
  'text_vote_processing': 'Processing...',
  'vote_area_fallback_all': 'All',
  'vote_area_fallback_kpop': 'K-POP',
  'vote_area_fallback_musical': 'K-MUSICAL',
  'vote_area_aria_all': 'All',
  'vote_area_aria_kpop': 'K-POP',
  'vote_area_aria_musical': 'K-MUSICAL',
  'vote_empty_state_ongoing': 'No ongoing votes',
  'vote_empty_state_upcoming': 'No upcoming votes',
  'vote_empty_state_completed': 'No completed votes',
  'vote_empty_state_default': 'No votes available',
  'vote_status_fallback_ongoing': 'Ongoing',
  'vote_status_fallback_upcoming': 'Upcoming',
  'vote_status_fallback_completed': 'Completed',
  'vote_status_ongoing_aria_label': 'Ongoing',
  'vote_status_upcoming_aria_label': 'Upcoming',
  'vote_status_completed_aria_label': 'Completed',
  'vote.unknownEventType': 'Unknown event type',
  'vote.testVote.title': 'Test Vote',
  'vote.testVote.content': 'This is a test vote.',
  'vote.loadError': 'Failed to load votes',
  'vote.loadErrorMessage': 'An error occurred while loading votes.',
};

function main() {
  if (!fs.existsSync(enPath)) {
    console.error(`en.json not found: ${enPath}`);
    process.exit(1);
  }
  const en = JSON.parse(fs.readFileSync(enPath, 'utf-8')) as Json;
  let changed = 0;
  for (const [k, v] of Object.entries(SEED_MAP)) {
    const cur = getByPath(en, k);
    if (cur === k || cur == null) {
      setByPath(en, k, v);
      changed += 1;
    }
  }
  if (changed > 0) {
    fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n', 'utf-8');
    console.log(`✅ Seeded ${changed} English values in en.json`);
  } else {
    console.log('No English seeds applied.');
  }
}

main();


