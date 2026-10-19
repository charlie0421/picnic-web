'use client';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { getDiagnosticBridge, UNAVAILABLE_DIAGNOSTIC_VIEW, type DiagnosticBridge } from '@/lib/sentry/replay/diagnostic-bridge';
const emptySubscribe = () => () => {};
const unavailable = () => UNAVAILABLE_DIAGNOSTIC_VIEW;
const buttonClass = 'rounded border px-3 py-2 text-sm';

export function ReplayDiagnostic() {
  const [bridge, setBridge] = useState<DiagnosticBridge | null>(null);
  const [open, setOpen] = useState(false);
  const idNode = useRef<HTMLSpanElement>(null);
  useEffect(() => { setBridge(getDiagnosticBridge()); }, []);
  const view = useSyncExternalStore(bridge?.subscribe ?? emptySubscribe, bridge?.snapshot ?? unavailable, unavailable);
  useLayoutEffect(() => {
    if (!bridge || view.phase !== 'recording' || !view.id) return;
    if (idNode.current?.textContent === view.id && idNode.current.getClientRects().length > 0) bridge.idDisplayed(view.id);
    else bridge.stop();
  }, [bridge, view.phase, view.id]);
  if (!bridge || view.phase === 'unavailable' || (view.phase === 'closed' && !view.id)) return null;
  const copy = () => { bridge.stop(); if (view.id) void navigator.clipboard?.writeText(view.id).catch(() => {}); };
  return <div className='fixed bottom-4 right-4 z-50 max-w-md rounded border bg-white p-4 text-gray-900 shadow-lg'>
    {view.phase === 'ready' && !open && <button type='button' className={buttonClass} onClick={() => setOpen(true)}>화면 문제 진단</button>}
    {view.phase === 'ready' && open && view.disclosure && <div role='dialog' aria-label='화면 문제 진단 안내'>
      <h3 className='font-bold'>화면 문제 진단</h3>
      <p className='mt-2 text-sm'>투표 목록의 배치·스크롤·배너 동작을 최대 60초 동안 기록합니다. 텍스트·입력값은 가리고 이미지·영상은 차단합니다. 동의는 이 페이지에서 한 번만 사용합니다.</p>
      <p className='mt-2 text-sm'>Sentry로 직접 전송하므로 전송 과정에서 IP 주소가 처리됩니다. 저장하는 기술 정보: {view.disclosure.storedTechnicalFields.length ? view.disclosure.storedTechnicalFields.join(', ') : '없음'}.</p>
      <p className='mt-2 text-sm'>자동 보관 기간은 {view.disclosure.retentionDays}일입니다. 담당자는 조사 종료 다음 업무일까지, 수집 후 최대 7일 안에 수동 삭제합니다.</p>
      <p className='mt-2 text-sm'>중지하면 추가 전송을 막지만 이미 도착한 기록은 삭제되지 않습니다. 삭제 요청: {view.disclosure.deletionRequestUrl}</p>
      <p className='mt-2 text-sm'>진단 번호를 보관해 문의에 포함해 주세요. 페이지를 닫으면 번호가 사라집니다. 번호가 없으면 기록을 찾거나 삭제 요청을 처리하기 어려울 수 있습니다. 번호를 공개 게시하지 마세요.</p>
      <p className='mt-2 text-sm'>포인터·휠 스크롤과 배너 버튼만 진단합니다. 다른 클릭·키 입력·화면 이동·탭 전환·창 크기 변경은 진단을 종료합니다. 중지와 번호 복사는 키보드로도 사용할 수 있습니다.</p>
      <div className='mt-3 flex gap-2'><button type='button' className={buttonClass} onClick={() => { flushSync(() => setOpen(false)); bridge.start(); }}>동의하고 시작</button><button type='button' className={buttonClass} onClick={() => setOpen(false)}>취소</button></div>
    </div>}
    {view.phase === 'loading' && <p>진단을 준비하고 있습니다.</p>}
    {(view.phase === 'recording' || view.id) && <div>
      <p>{view.phase === 'recording' ? '진단 중 · 최대 60초' : '진단이 종료되었습니다.'}</p>
      <p className='break-all text-sm'>진단 번호: <span ref={idNode}>{view.id}</span></p>
      <button type='button' className={buttonClass} onClick={copy}>번호 복사</button>
    </div>}
    {(view.phase === 'loading' || view.phase === 'recording') && <button type='button' className={buttonClass} onClick={() => bridge.stop()}>중지</button>}
    {view.delivery === 'accepted' && <p className='mt-2 text-sm'>전송 응답을 받았습니다. 저장·재생 여부는 확인이 필요합니다.</p>}
    {view.delivery === 'unknown' && <p className='mt-2 text-sm'>전송이 중단되어 저장 여부를 확인할 수 없습니다.</p>}
  </div>;
}
