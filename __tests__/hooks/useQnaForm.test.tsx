import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQnaForm } from '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/useQnaForm';
import type {
  QnaThreadWithRelations,
  UiQnaMessage,
} from '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/qna-utils';

const THREAD: QnaThreadWithRelations = {
  category_code: null,
  created_at: '2026-09-26T00:00:00.000Z',
  id: 1,
  status: 'RECEIVED',
  title: 'Attachment issue',
  updated_at: '2026-09-26T00:00:00.000Z',
  user_id: 'user-1',
  qna_messages: [],
};

function QnaFormHarness() {
  const [messages, setMessages] = useState<UiQnaMessage[]>([]);
  const form = useQnaForm({
    thread: THREAD,
    messages,
    setMessages,
    addOptimisticMessage: vi.fn(),
  });
  const submitError = (
    form as typeof form & { submitError?: string | null }
  ).submitError;

  return (
    <form ref={form.formRef} onSubmit={form.handleSubmit} data-testid="qna-form">
      <input type="hidden" name="thread_id" value={THREAD.id} />
      <input name="content" aria-label="message" />
      <input
        type="file"
        ref={form.fileInputRef}
        onChange={form.handleFileChange}
        aria-label="attachment"
      />
      <button type="submit">send</button>
      <output data-testid="attachment-count">{form.attachments.length}</output>
      {submitError && <p role="alert">{submitError}</p>}
    </form>
  );
}

describe('useQnaForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:attachment-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores text and attachments and exposes the server error after a 415 response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 415,
      json: async () => ({
        success: false,
        error: 'Unsupported attachment type.',
      }),
    } as Response);
    render(<QnaFormHarness />);

    const messageInput = screen.getByRole('textbox', { name: 'message' });
    const attachmentInput = screen.getByLabelText('attachment');
    const unsupportedFile = new File(['heic'], 'photo.heic', {
      type: 'image/heic',
    });

    fireEvent.change(messageInput, { target: { value: 'Please keep this' } });
    fireEvent.change(attachmentInput, {
      target: { files: [unsupportedFile] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-count')).toHaveTextContent('1');
    });

    fireEvent.submit(screen.getByTestId('qna-form'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unsupported attachment type.',
    );
    expect(messageInput).toHaveValue('Please keep this');
    expect(screen.getByTestId('attachment-count')).toHaveTextContent('1');
    expect((attachmentInput as HTMLInputElement).files?.[0]).toBe(
      unsupportedFile,
    );
  });

  it('resets text and attachments after the server accepts the message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          content: 'Sent message',
          created_at: '2026-09-26T00:00:00.000Z',
          id: 2,
          is_admin_message: false,
          thread_id: 1,
          user_id: 'user-1',
          qna_attachments: [],
          user_profiles: { nickname: 'You', avatar_url: '' },
        },
      }),
    } as Response);
    render(<QnaFormHarness />);

    const messageInput = screen.getByRole('textbox', { name: 'message' });
    const attachmentInput = screen.getByLabelText('attachment');
    fireEvent.change(messageInput, { target: { value: 'Sent message' } });
    fireEvent.change(attachmentInput, {
      target: {
        files: [new File(['png'], 'photo.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-count')).toHaveTextContent('1');
    });

    fireEvent.submit(screen.getByTestId('qna-form'));

    await waitFor(() => {
      expect(messageInput).toHaveValue('');
      expect(screen.getByTestId('attachment-count')).toHaveTextContent('0');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
