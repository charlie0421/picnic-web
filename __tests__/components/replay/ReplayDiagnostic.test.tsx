import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReplayDiagnostic } from '@/components/replay/ReplayDiagnostic';
const fixture=vi.hoisted(()=>({bridge:null as any}));
vi.mock('@/lib/sentry/replay/diagnostic-bridge',()=>({getDiagnosticBridge:()=>fixture.bridge,UNAVAILABLE_DIAGNOSTIC_VIEW:{phase:'unavailable',id:null,delivery:'none',disclosure:null}}));
let view:any,listeners:Set<()=>void>;
beforeEach(()=>{
 view={phase:'ready',id:null,delivery:'none',disclosure:{retentionDays:30,deletionRequestUrl:'https://www.picnic.fan/support',storedTechnicalFields:['browser']}};listeners=new Set();
 fixture.bridge={snapshot:()=>view,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},start:vi.fn(),stop:vi.fn(),idDisplayed:vi.fn()};
 vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([{width:100,height:20}] as any);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('opening and cancelling disclosure does not start, navigate or consume the attempt',()=>{render(<StrictMode><ReplayDiagnostic/></StrictMode>);fireEvent.click(screen.getByRole('button',{name:'화면 문제 진단'}));expect(screen.getByText(/최대 60초/)).toBeTruthy();expect(document.querySelector('a')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'취소'}));expect(fixture.bridge.start).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'화면 문제 진단'}));fireEvent.click(screen.getByRole('button',{name:'동의하고 시작'}));expect(fixture.bridge.start).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'동의하고 시작'})).toBeNull();});
it('confirms the actual ID only after its DOM is visible and stops before copying',async()=>{view={...view,phase:'recording',id:'a'.repeat(32)};const copy=vi.fn(async()=>{expect(fixture.bridge.stop).toHaveBeenCalled();});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<ReplayDiagnostic/>);expect(fixture.bridge.idDisplayed).toHaveBeenCalledWith(view.id);fireEvent.click(screen.getByRole('button',{name:'번호 복사'}));expect(copy).toHaveBeenCalledWith(view.id);});
it('closes if the ID cannot be confirmed visible',()=>{vi.mocked(Element.prototype.getClientRects).mockReturnValue([] as any);view={...view,phase:'recording',id:'a'.repeat(32)};render(<ReplayDiagnostic/>);expect(fixture.bridge.idDisplayed).not.toHaveBeenCalled();expect(fixture.bridge.stop).toHaveBeenCalled();});
it.each(['unavailable','closed'])('hides the entry on %s without an ID',phase=>{view={...view,phase};render(<ReplayDiagnostic/>);expect(screen.queryByRole('button',{name:'화면 문제 진단'})).toBeNull();});
it('reports receipt without claiming storage or playback',()=>{view={...view,phase:'closed',id:'a'.repeat(32),delivery:'accepted'};render(<ReplayDiagnostic/>);expect(screen.getByText('전송 응답을 받았습니다. 저장·재생 여부는 확인이 필요합니다.')).toBeTruthy();});
