import { NextRequest, NextResponse } from 'next/server';
import { Language } from '@/config/settings';

interface TranslationError {
  key: string;
  language: Language;
  timestamp: number;
  context?: string;
  fallbackUsed?: string;
}

interface ReportRequest {
  errors: TranslationError[];
  userAgent: string;
  url: string;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();
    
    // 요청 검증
    if (!body.errors || !Array.isArray(body.errors)) {
      return NextResponse.json(
        { error: 'Invalid request: errors array is required' },
        { status: 400 }
      );
    }

    // 개발 환경에서는 콘솔에 로깅
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 [Translation Report] Received missing translation report:');
      console.log(`  URL: ${body.url}`);
      console.log(`  User Agent: ${body.userAgent}`);
      console.log(`  Errors (${body.errors.length}):`);
      
      body.errors.forEach((error, index) => {
        console.log(`    ${index + 1}. Key: "${error.key}" | Language: ${error.language} | Context: ${error.context || 'none'}`);
        if (error.fallbackUsed) {
          console.log(`       Fallback used: "${error.fallbackUsed}"`);
        }
      });
    }

    // 프로덕션 환경에서는 실제 로깅 서비스나 데이터베이스에 저장
    if (process.env.NODE_ENV === 'production') {
      // TODO: 실제 로깅 서비스 (예: Sentry, LogRocket, 자체 데이터베이스)에 저장
      // await saveToLoggingService(body);
      
      // 예시: 파일 시스템에 저장 (실제 프로덕션에서는 권장하지 않음)
      const fs = await import('fs/promises');
      const path = await import('path');
      
      try {
        const logDir = path.join(process.cwd(), 'logs');
        await fs.mkdir(logDir, { recursive: true });
        
        const logFile = path.join(logDir, `translation-errors-${new Date().toISOString().split('T')[0]}.json`);
        const logEntry = {
          timestamp: new Date().toISOString(),
          ...body,
        };
        
        // 기존 로그 파일 읽기 (있는 경우)
        let existingLogs: any[] = [];
        try {
          const existingData = await fs.readFile(logFile, 'utf-8');
          existingLogs = JSON.parse(existingData);
        } catch {
          // 파일이 없거나 파싱 실패 시 빈 배열로 시작
        }
        
        // 새 로그 추가
        existingLogs.push(logEntry);
        
        // 파일에 저장
        await fs.writeFile(logFile, JSON.stringify(existingLogs, null, 2));
      } catch (fileError) {
        console.error('Failed to save translation errors to file:', fileError);
      }
    }

    // 통계 정보 생성
    const stats = {
      totalErrors: body.errors.length,
      byLanguage: body.errors.reduce((acc, error) => {
        acc[error.language] = (acc[error.language] || 0) + 1;
        return acc;
      }, {} as Record<Language, number>),
      byContext: body.errors.reduce((acc, error) => {
        const context = error.context || 'unknown';
        acc[context] = (acc[context] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      success: true,
      message: `Received ${body.errors.length} translation error reports`,
      stats,
    });

  } catch (error) {
    console.error('Error processing translation report:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET 요청으로 통계 조회 (개발 환경에서만)
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    );
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const logDir = path.join(process.cwd(), 'logs');
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `translation-errors-${today}.json`);
    
    try {
      const data = await fs.readFile(logFile, 'utf-8');
      const logs = JSON.parse(data);
      
      // 통계 생성
      const allErrors = logs.flatMap((log: any) => log.errors || []);
      const stats = {
        totalReports: logs.length,
        totalErrors: allErrors.length,
        byLanguage: allErrors.reduce((acc: any, error: TranslationError) => {
          acc[error.language] = (acc[error.language] || 0) + 1;
          return acc;
        }, {}),
        recentErrors: allErrors
          .sort((a: TranslationError, b: TranslationError) => b.timestamp - a.timestamp)
          .slice(0, 20),
      };
      
      return NextResponse.json(stats);
    } catch {
      return NextResponse.json({
        totalReports: 0,
        totalErrors: 0,
        byLanguage: {},
        recentErrors: [],
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read translation logs' },
      { status: 500 }
    );
  }
} 