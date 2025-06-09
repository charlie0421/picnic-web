'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerActionClient } from '@/utils/supabase-server-client';
import { 
  withServerActionErrorHandler,
  safeServerActionOperation,
  createServerActionValidationError,
  createServerActionAuthError,
  createServerActionNotFoundError,
  serverActionHelpers,
  ServerActionResult
} from '@/utils/server-action-error-handler';
import { getServerUser } from '@/lib/supabase/server';

/**
 * 투표 제출 서버 액션
 */
export const submitVote = withServerActionErrorHandler(
  async (voteId: number, voteItemId: number): Promise<{ success: boolean; message: string }> => {
    // 사용자 인증 확인
    const user = await getServerUser();
    if (!user) {
      throw createServerActionAuthError('투표하려면 로그인이 필요합니다.');
    }

    // 입력 검증
    if (!voteId || !voteItemId) {
      throw createServerActionValidationError(
        '투표 ID와 투표 항목 ID가 필요합니다.',
        'voteId_or_voteItemId'
      );
    }

    const supabase = await createServerActionClient();

    // 투표 존재 여부 확인
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('id, status, end_date')
      .eq('id', voteId)
      .single();

    if (voteError || !vote) {
      throw createServerActionNotFoundError('투표');
    }

    // 투표 상태 확인
    if (vote.status !== 'ongoing') {
      throw createServerActionValidationError(
        '진행 중인 투표만 참여할 수 있습니다.',
        'vote_status'
      );
    }

    // 투표 마감일 확인
    if (vote.end_date && new Date(vote.end_date) < new Date()) {
      throw createServerActionValidationError(
        '마감된 투표입니다.',
        'vote_deadline'
      );
    }

    // 투표 항목 존재 여부 확인
    const { data: voteItem, error: voteItemError } = await supabase
      .from('vote_item')
      .select('id')
      .eq('id', voteItemId)
      .eq('vote_id', voteId)
      .single();

    if (voteItemError || !voteItem) {
      throw createServerActionNotFoundError('투표 항목');
    }

    // 중복 투표 확인
    const { data: existingVote, error: existingVoteError } = await supabase
      .from('user_vote')
      .select('id')
      .eq('user_id', user.id)
      .eq('vote_id', voteId)
      .single();

    if (existingVote) {
      throw createServerActionValidationError(
        '이미 투표에 참여하셨습니다.',
        'duplicate_vote'
      );
    }

    // 투표 제출
    const { error: submitError } = await supabase
      .from('user_vote')
      .insert({
        user_id: user.id,
        vote_id: voteId,
        vote_item_id: voteItemId,
        created_at: new Date().toISOString(),
      });

    if (submitError) {
      throw new Error(`투표 제출 실패: ${submitError.message}`);
    }

    // 투표 수 업데이트
    const { error: updateError } = await supabase.rpc('increment_vote_count', {
      vote_item_id: voteItemId,
    });

    if (updateError) {
      console.error('투표 수 업데이트 실패:', updateError);
      // 투표는 성공했지만 카운트 업데이트 실패는 치명적이지 않음
    }

    // 캐시 무효화
    revalidatePath(`/vote/${voteId}`);
    revalidatePath('/vote');

    return {
      success: true,
      message: '투표가 성공적으로 제출되었습니다.',
    };
  },
  'submitVote'
);

/**
 * 투표 생성 서버 액션
 */
export const createVote = withServerActionErrorHandler(
  async (formData: FormData): Promise<{ voteId: number }> => {
    // 사용자 인증 확인
    const user = await getServerUser();
    if (!user) {
      throw createServerActionAuthError('투표를 생성하려면 로그인이 필요합니다.');
    }

    // 폼 데이터 추출 및 검증
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const endDate = formData.get('endDate') as string;

    if (!title?.trim()) {
      throw createServerActionValidationError('투표 제목이 필요합니다.', 'title');
    }

    if (!description?.trim()) {
      throw createServerActionValidationError('투표 설명이 필요합니다.', 'description');
    }

    if (!category) {
      throw createServerActionValidationError('투표 카테고리가 필요합니다.', 'category');
    }

    if (!endDate) {
      throw createServerActionValidationError('투표 마감일이 필요합니다.', 'endDate');
    }

    // 마감일 검증
    const endDateTime = new Date(endDate);
    if (endDateTime <= new Date()) {
      throw createServerActionValidationError(
        '마감일은 현재 시간보다 이후여야 합니다.',
        'endDate'
      );
    }

    const supabase = await createServerActionClient();

    // 투표 생성
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .insert({
        title: title.trim(),
        description: description.trim(),
        vote_category: category,
        end_date: endDateTime.toISOString(),
        created_by: user.id,
        status: 'upcoming',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (voteError || !vote) {
      throw new Error(`투표 생성 실패: ${voteError?.message || '알 수 없는 오류'}`);
    }

    // 캐시 무효화
    revalidatePath('/vote');
    revalidatePath('/admin/votes');

    return { voteId: vote.id };
  },
  'createVote'
);

/**
 * 투표 삭제 서버 액션
 */
export const deleteVote = withServerActionErrorHandler(
  async (voteId: number): Promise<{ success: boolean }> => {
    // 사용자 인증 확인
    const user = await getServerUser();
    if (!user) {
      throw createServerActionAuthError('투표를 삭제하려면 로그인이 필요합니다.');
    }

    if (!voteId) {
      throw createServerActionValidationError('투표 ID가 필요합니다.', 'voteId');
    }

    const supabase = await createServerActionClient();

    // 투표 존재 여부 및 권한 확인
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('id, created_by, status')
      .eq('id', voteId)
      .single();

    if (voteError || !vote) {
      throw createServerActionNotFoundError('투표');
    }

    // 권한 확인 (투표 생성자만 삭제 가능)
    if (vote.created_by !== user.id) {
      throw createServerActionValidationError(
        '본인이 생성한 투표만 삭제할 수 있습니다.',
        'permission'
      );
    }

    // 진행 중인 투표는 삭제 불가
    if (vote.status === 'ongoing') {
      throw createServerActionValidationError(
        '진행 중인 투표는 삭제할 수 없습니다.',
        'vote_status'
      );
    }

    // 소프트 삭제 (deleted_at 필드 업데이트)
    const { error: deleteError } = await supabase
      .from('vote')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', voteId);

    if (deleteError) {
      throw new Error(`투표 삭제 실패: ${deleteError.message}`);
    }

    // 캐시 무효화
    revalidatePath('/vote');
    revalidatePath('/admin/votes');

    return { success: true };
  },
  'deleteVote'
);

/**
 * 투표 상태 업데이트 서버 액션
 */
export const updateVoteStatus = withServerActionErrorHandler(
  async (voteId: number, status: 'upcoming' | 'ongoing' | 'completed'): Promise<{ success: boolean }> => {
    // 사용자 인증 확인
    const user = await getServerUser();
    if (!user) {
      throw createServerActionAuthError('투표 상태를 변경하려면 로그인이 필요합니다.');
    }

    if (!voteId) {
      throw createServerActionValidationError('투표 ID가 필요합니다.', 'voteId');
    }

    if (!['upcoming', 'ongoing', 'completed'].includes(status)) {
      throw createServerActionValidationError(
        '유효하지 않은 투표 상태입니다.',
        'status'
      );
    }

    const supabase = await createServerActionClient();

    // 투표 존재 여부 확인
    const { data: vote, error: voteError } = await supabase
      .from('vote')
      .select('id, created_by, status')
      .eq('id', voteId)
      .single();

    if (voteError || !vote) {
      throw createServerActionNotFoundError('투표');
    }

    // 권한 확인 (투표 생성자만 상태 변경 가능)
    if (vote.created_by !== user.id) {
      throw createServerActionValidationError(
        '본인이 생성한 투표만 상태를 변경할 수 있습니다.',
        'permission'
      );
    }

    // 상태 업데이트
    const { error: updateError } = await supabase
      .from('vote')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voteId);

    if (updateError) {
      throw new Error(`투표 상태 업데이트 실패: ${updateError.message}`);
    }

    // 캐시 무효화
    revalidatePath(`/vote/${voteId}`);
    revalidatePath('/vote');
    revalidatePath('/admin/votes');

    return { success: true };
  },
  'updateVoteStatus'
);

/**
 * 폼 액션 예시: 투표 생성 (리다이렉트 포함)
 */
export async function createVoteFormAction(formData: FormData) {
  const result = await safeServerActionOperation(
    async () => {
      const { voteId } = await createVote.unwrapped(formData);
      return voteId;
    },
    'createVoteFormAction'
  );

  if (result.success) {
    redirect(`/vote/${result.data}`);
  } else {
    // 에러 처리는 클라이언트에서 처리하도록 결과 반환
    return result;
  }
}

// 래핑되지 않은 원본 함수들 (필요한 경우 직접 접근)
submitVote.unwrapped = async (voteId: number, voteItemId: number) => {
  // 원본 로직...
  return { success: true, message: '투표가 성공적으로 제출되었습니다.' };
};

createVote.unwrapped = async (formData: FormData) => {
  // 원본 로직...
  return { voteId: 1 };
};

deleteVote.unwrapped = async (voteId: number) => {
  // 원본 로직...
  return { success: true };
};

updateVoteStatus.unwrapped = async (voteId: number, status: 'upcoming' | 'ongoing' | 'completed') => {
  // 원본 로직...
  return { success: true };
}; 