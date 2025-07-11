/**
 * 로딩바를 표시할 페이지인지 판단하는 함수
 * 모든 페이지 이동에서 로딩바 표시하여 UX 일관성 제공
 */
export function shouldShowLoadingFor(href: string): boolean {
  // 모든 페이지 이동에서 로딩바 표시
  return true;
}

/**
 * 현재 경로와 타겟 경로가 같은지 확인하는 함수
 */
export function isSamePage(currentPath: string, targetPath: string): boolean {
  return currentPath === targetPath;
}

/**
 * mypage 내에서의 이동인지 확인하는 함수
 */
export function isMypageNavigation(currentPath: string, targetPath: string): boolean {
  return currentPath.includes('/mypage') && targetPath.includes('/mypage');
} 