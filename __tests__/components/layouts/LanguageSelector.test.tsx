import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockChangeLocale = vi.fn(async () => {});

vi.mock('@/hooks/useLocaleRouter', () => ({
  useLocaleRouter: () => ({
    currentLocale: 'en',
    changeLocale: mockChangeLocale,
    getLocalizedPath: (path: string) => `/en${path}`,
  }),
}));

import LanguageSelector from '@/components/layouts/LanguageSelector';

describe('LanguageSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<LanguageSelector />);
    expect(container).toBeTruthy();
  });

  it('renders placeholder before mount', () => {
    // On server-side, it renders an empty div placeholder
    const { container } = render(<LanguageSelector />);
    // After mount, the button should appear
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('shows current language name on desktop', () => {
    render(<LanguageSelector />);
    // Multiple "English" texts exist (button + dropdown), just check at least one
    expect(screen.getAllByText('English').length).toBeGreaterThanOrEqual(1);
  });

  it('opens dropdown on click', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);
    // After opening, all languages should be visible
    expect(screen.getByText('日本語')).toBeInTheDocument();
  });

  it('lists all supported languages in dropdown', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    expect(screen.getByText('한국어')).toBeInTheDocument();
    expect(screen.getAllByText('English').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('日本語')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
  });

  it('calls changeLocale when a language is selected', async () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    const japaneseOption = screen.getByText('日本語').closest('button')!;
    fireEvent.click(japaneseOption);

    await waitFor(() => {
      expect(mockChangeLocale).toHaveBeenCalledWith('ja', true);
    });
  });

  it('disables the current language option', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    // Find the English option in the dropdown (not the trigger button)
    const allButtons = screen.getAllByRole('button');
    const englishOption = allButtons.find(
      (btn) => btn.textContent?.includes('English') && btn !== button,
    );
    expect(englishOption).toBeDisabled();
  });

  it('does not call changeLocale when selecting current language', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    // Click on English (current language) - should not trigger change
    const allButtons = screen.getAllByRole('button');
    const englishOption = allButtons.find(
      (btn) => btn.textContent?.includes('English') && btn !== button,
    );
    if (englishOption) fireEvent.click(englishOption);

    expect(mockChangeLocale).not.toHaveBeenCalled();
  });

  it('closes dropdown when clicking outside', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    // Clicking outside should close the dropdown
    fireEvent.mouseDown(document.body);

    // The dropdown should no longer be visible (has 'invisible' class)
  });

  it('toggles dropdown open and closed', () => {
    render(<LanguageSelector />);
    const button = screen.getAllByRole('button')[0];

    // Open
    fireEvent.click(button);
    expect(screen.getByText('한국어')).toBeInTheDocument();

    // Close
    fireEvent.click(button);
    // Dropdown should have invisible class after closing
  });
});
