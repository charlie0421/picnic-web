'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * 500 에러 페이지 테스트용 컴포넌트
 * 
 * 브라우저에서 다음 URL로 접속하여 테스트:
 * - /ko/test-500-error
 * - /en/test-500-error
 * - /ja/test-500-error
 * 
 * 다양한 에러 타입을 쿼리 파라미터로 테스트 가능:
 * - ?type=immediate → 즉시 에러 발생
 * - ?type=delayed → 3초 후 에러 발생
 * - ?type=render → 렌더링 중 에러 발생
 * - ?type=state → 상태 업데이트 중 에러 발생
 */

export default function Test500ErrorPage() {
  const params = useParams()
  const [countdown, setCountdown] = useState(3)
  const [shouldError, setShouldError] = useState(false)

  // URL에서 쿼리 파라미터 읽기
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const errorType = urlParams.get('type') || 'immediate'

  useEffect(() => {
    console.log('🧪 [Test500Error] 페이지 로드됨:', { 
      language: params.lang,
      errorType,
      timestamp: new Date().toISOString()
    })

    if (errorType === 'immediate') {
      // 즉시 에러 발생
      throw new Error('🚨 테스트용 즉시 에러: 이것은 의도적인 500 에러 테스트입니다!')
    }

    if (errorType === 'delayed') {
      // 3초 카운트다운 후 에러 발생
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            // 상태 업데이트로 에러 트리거
            setShouldError(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }

    if (errorType === 'state') {
      // 2초 후 상태 업데이트 중 에러 발생
      const timer = setTimeout(() => {
        setShouldError(true)
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [errorType, params.lang])

  // 상태 기반 에러 발생
  if (shouldError) {
    throw new Error(`🚨 테스트용 ${errorType} 에러: 이것은 의도적인 500 에러 테스트입니다! (${errorType})`)
  }

  // 렌더링 중 에러 발생
  if (errorType === 'render') {
    throw new Error('🚨 테스트용 렌더링 에러: 이것은 의도적인 500 에러 테스트입니다!')
  }

  const translations = {
    ko: {
      title: '500 에러 테스트 페이지',
      description: '이 페이지는 500 에러를 테스트하기 위한 페이지입니다.',
      currentType: '현재 에러 타입',
      countdown: '에러 발생까지',
      testLinks: '테스트 링크들',
      immediateError: '즉시 에러 발생',
      delayedError: '3초 후 에러 발생',
      renderError: '렌더링 에러 발생',
      stateError: '상태 업데이트 에러 발생'
    },
    en: {
      title: '500 Error Test Page',
      description: 'This page is for testing 500 errors.',
      currentType: 'Current Error Type',
      countdown: 'Error in',
      testLinks: 'Test Links',
      immediateError: 'Immediate Error',
      delayedError: 'Delayed Error (3s)',
      renderError: 'Render Error',
      stateError: 'State Update Error'
    },
    ja: {
      title: '500エラーテストページ',
      description: 'このページは500エラーをテストするためのページです。',
      currentType: '現在のエラータイプ',
      countdown: 'エラーまで',
      testLinks: 'テストリンク',
      immediateError: '即座にエラー発生',
      delayedError: '3秒後エラー発生',
      renderError: 'レンダリングエラー発生',
      stateError: 'ステート更新エラー発生'
    }
  }

  const currentLang = (params.lang as string) || 'ko'
  const t = translations[currentLang as keyof typeof translations] || translations.ko

  return (
    <div style={{
      minHeight: '100vh',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: '600px',
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#dc3545',
          marginBottom: '20px'
        }}>
          🧪 {t.title}
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#666',
          marginBottom: '30px',
          lineHeight: '1.5'
        }}>
          {t.description}
        </p>

        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '30px'
        }}>
          <p style={{
            fontSize: '14px',
            color: '#495057',
            marginBottom: '10px'
          }}>
            <strong>{t.currentType}:</strong> {errorType}
          </p>

          {errorType === 'delayed' && countdown > 0 && (
            <p style={{
              fontSize: '18px',
              color: '#dc3545',
              fontWeight: 'bold'
            }}>
              {t.countdown}: {countdown}초
            </p>
          )}

          {errorType === 'state' && (
            <p style={{
              fontSize: '16px',
              color: '#ffc107',
              fontWeight: 'bold'
            }}>
              ⏳ 2초 후 상태 업데이트 에러 발생...
            </p>
          )}
        </div>

        <div style={{
          textAlign: 'left'
        }}>
          <h3 style={{
            fontSize: '18px',
            marginBottom: '15px',
            color: '#495057'
          }}>
            {t.testLinks}:
          </h3>

          <div style={{
            display: 'grid',
            gap: '10px'
          }}>
            <a 
              href={`/${currentLang}/test-500-error?type=immediate`}
              style={{
                display: 'block',
                padding: '12px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              ⚡ {t.immediateError}
            </a>

            <a 
              href={`/${currentLang}/test-500-error?type=delayed`}
              style={{
                display: 'block',
                padding: '12px 16px',
                backgroundColor: '#fd7e14',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              ⏰ {t.delayedError}
            </a>

            <a 
              href={`/${currentLang}/test-500-error?type=render`}
              style={{
                display: 'block',
                padding: '12px 16px',
                backgroundColor: '#e83e8c',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🎨 {t.renderError}
            </a>

            <a 
              href={`/${currentLang}/test-500-error?type=state`}
              style={{
                display: 'block',
                padding: '12px 16px',
                backgroundColor: '#6610f2',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🔄 {t.stateError}
            </a>
          </div>
        </div>

        <div style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#d1ecf1',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#0c5460'
        }}>
          <strong>💡 팁:</strong> 각 링크를 클릭하면 해당 타입의 에러가 발생하여 
          커스텀 500 에러 페이지가 표시됩니다.
        </div>
      </div>
    </div>
  )
} 