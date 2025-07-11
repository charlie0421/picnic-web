/**
 * 로딩바를 표시할 페이지인지 판단하는 함수
 * mypage와 vote 페이지로의 이동 시에만 로딩바 표시
 */
export function shouldShowLoadingFor(href: string): boolean {
  // mypage 관련 경로
  if (href.includes('/mypage') || href === '/mypage') {
    return true;
  }
  
  // vote 관련 경로 (vote 상세 페이지, vote 목록 등)
  if (href.includes('/vote') || href === '/vote') {
    return true;
  }
  
  // 기타 페이지들은 로딩바 표시하지 않음
  return false;
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