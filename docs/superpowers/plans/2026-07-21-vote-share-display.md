# Web Vote Share Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the app's percentage-based candidate vote display to every active web vote surface, including raw counts in parentheses for admins.

**Architecture:** Add pure vote-display utilities that own percentage precision, zero handling, raw-count formatting, and status/admin branching. Existing vote containers calculate totals from their complete candidate arrays and pass a final display label or explicit display context into reusable cards, keeping authentication and vote state outside the formatter.

**Tech Stack:** Next.js 15, React 18, TypeScript, Zustand/auth provider, Vitest, Testing Library

## Global Constraints

- Ongoing candidate values use the app's dynamic 2–4 decimal percentage precision.
- Admin and super-admin labels use `percentage (raw count)`.
- Completed candidate values retain raw counts; detail header `총 N표` remains unchanged.
- Upcoming or non-positive-total candidate values render `—`.
- Percentages always use the complete non-deleted candidate collection as the denominator.
- Existing unrelated untracked `coverage/`, `reports/`, and `tsconfig.tsbuildinfo` files must not be modified or committed.

---

### Task 1: Pure vote display formatter

**Files:**
- Create: `components/client/vote/common/vote-display-utils.ts`
- Create: `__tests__/components/client/vote/vote-display-utils.test.ts`

**Interfaces:**
- Produces `sharePercentDecimals(percentage: number): number`.
- Produces `formatVoteShare(votes: number | null | undefined, totalVotes: number): string`.
- Produces `formatCandidateVote({ votes, totalVotes, status, isAdmin, includeVoteUnit? }): string`.
- Produces `sumVoteTotals(items): number`, excluding deleted rows.

- [ ] **Step 1: Write failing formatter tests**

Cover exact expectations: `35.20%`, `0.18%`, `0.076%`, `0.0032%`, rounding `35.199% -> 35.20%`, `<0.0001%`, `—`, `100.00%`, admin `35.20% (711,479)`, completed `711,479`, completed with unit `711,479 표`, upcoming `—`, deleted rows excluded from totals, and negative/null totals treated as zero.

- [ ] **Step 2: Verify RED**

Run `npm test -- __tests__/components/client/vote/vote-display-utils.test.ts`.

Expected: FAIL because `vote-display-utils.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure utilities**

Use `Math.min(4, Math.max(2, 2 - Math.floor(Math.log10(percentage)) - 1))` for decimal precision. Return an em dash before division when votes or total are non-positive. Use `toFixed()` for rounding and `toLocaleString('en-US')` for raw counts. Accept status `'ongoing' | 'completed' | 'upcoming' | 'admin'`; only `'ongoing'` and `'admin'` are percentage-bearing active states.

- [ ] **Step 4: Verify GREEN**

Run the focused formatter test and expect all cases to pass.

- [ ] **Step 5: Commit**

Commit the utility and its test with message `feat(vote): add shared vote share formatter`.

---

### Task 2: Active vote list and reusable card surfaces

**Files:**
- Modify: `components/client/vote/list/OngoingVoteItems.tsx`
- Modify: `components/client/vote/list/VoteItem.tsx`
- Modify: `components/client/vote/list/VoteSubmit.tsx`
- Modify: `components/client/vote/list/VoteResults.tsx`
- Modify: `components/client/vote/common/RankingView.tsx`
- Modify: `components/client/vote/common/VoteRankCard.tsx`
- Modify: `components/client/vote/common/VoteRankCardAnimated.tsx`
- Modify: `components/client/vote/common/vote-rank-card-utils.ts`
- Test: `__tests__/components/client/vote/VoteRankCard.test.tsx`
- Test: `__tests__/components/client/vote/RankingView.test.tsx`
- Create: `__tests__/components/client/vote/OngoingVoteItems.test.tsx`

**Interfaces:**
- `VoteRankCardProps` gains optional `voteDisplay?: string`; absence preserves legacy raw numeric rendering.
- `OngoingVoteItems` reads `is_admin || is_super_admin` through `useAuth`, computes `totalVotes` from all normalized rows, and passes both values to each mini-podium renderer.
- Other reusable candidate surfaces gain optional `totalVotes`, `voteStatus`, and `isAdmin` inputs so real callers can opt into the formatter without breaking legacy callers.

- [ ] **Step 1: Write failing component tests**

Assert that an ongoing list with 70/30 votes renders `70.00%` and `30.00%`, an admin renders `70.00% (70)`, and `VoteRankCard` displays a supplied `voteDisplay` in both static and animated branches. Add a ranking test proving the denominator includes every item, not only the top three.

- [ ] **Step 2: Verify RED**

Run the three focused test files. Expected: the new percentage assertions fail against raw numeric output.

- [ ] **Step 3: Implement list/card wiring**

Use `formatCandidateVote()` where complete candidate arrays and status are known. Pass the resulting string through `voteDisplay` to static and animated `VoteRankCard` paths. Replace raw candidate labels in active list-related components while retaining raw totals and `표` suffixes for completed/results-only contexts.

- [ ] **Step 4: Verify GREEN**

Run the same focused tests and expect all to pass.

- [ ] **Step 5: Commit**

Commit list/card changes with message `feat(vote): show shares across vote list surfaces`.

---

### Task 3: Vote detail grid and podium

**Files:**
- Modify: `components/client/vote/detail/useVoteDetail.ts`
- Modify: `components/client/vote/detail/VoteDetailPresenter.tsx`
- Modify: `components/client/vote/detail/VotePodium.tsx`
- Create: `__tests__/components/client/vote/VoteDetailPresenter.share.test.tsx`

**Interfaces:**
- `useVoteDetail()` returns `totalVotes` and `isAdmin`.
- `VotePodiumProps` gains `totalVotes`, `voteStatus`, and `isAdmin`.
- The detail grid and podium use the same total and permission state.

- [ ] **Step 1: Write failing detail tests**

Mock the detail hook with 70/30 candidates. Assert both podium and grid display percentages for ordinary users, admin labels contain raw counts in parentheses, completed labels remain raw counts, and the header still says `총 100 표`.

- [ ] **Step 2: Verify RED**

Run `npm test -- __tests__/components/client/vote/VoteDetailPresenter.share.test.tsx` and confirm failure is caused by raw candidate output.

- [ ] **Step 3: Implement detail wiring**

Read `userProfile` from `useAuth()` inside `useVoteDetail`, default unknown profiles to non-admin, return the memoized total, and call `formatCandidateVote()` in the grid and podium. Keep the header total semantically unchanged.

- [ ] **Step 4: Verify GREEN and regression tests**

Run the new detail test plus the focused list/card tests, then run `npx tsc --noEmit`. Expect zero failures.

- [ ] **Step 5: Commit**

Commit detail changes with message `feat(vote): show shares in vote detail`.

---

### Task 4: Full verification and scope audit

**Files:**
- Verify only; modify earlier scoped files only if verification exposes a defect.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Audit candidate count renderers**

Run `rg -n "vote_total.*toLocaleString|voteCount.*toLocaleString|formattedTotal|AnimatedCount" components/client/vote` and classify every match as percentage-enabled active candidate output, deliberately retained completed/raw total output, balance display, or debug-only output.

- [ ] **Step 2: Run all vote component tests**

Run `npm test -- __tests__/components/client/vote` and expect all tests to pass.

- [ ] **Step 3: Run type and diff validation**

Run `npx tsc --noEmit`, `git diff --check`, and `git status --short`. Expect successful type checking, no whitespace errors, and only scoped files plus pre-existing untracked artifacts.

- [ ] **Step 4: Request code review and address findings**

Review against `docs/superpowers/specs/2026-07-21-vote-share-display-design.md`; fix every critical and important finding before fresh final verification.
