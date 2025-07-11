/**
 * 현재 경로와 타겟 경로가 같은지 확인하는 함수
 */
export function isSamePage(currentPath: string, targetPath: string): boolean {
  return currentPath === targetPath;
} 