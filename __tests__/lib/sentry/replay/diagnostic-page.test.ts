import { afterEach, expect, it, vi } from 'vitest';
import { diagnosticPageIsSafe } from '@/lib/sentry/replay/page-safety';
const browser=(href='https://www.picnic.fan/ko/vote', ua='Mozilla Chrome/153.0', data:any={brands:[{brand:'Google Chrome',version:'153'}],mobile:false,platform:'macOS'})=>({location:{href,origin:new URL(href).origin},document,navigator:{userAgent:ua,userAgentData:data},performance:{getEntriesByType:()=>[]}} as unknown as Window);
afterEach(()=>{vi.restoreAllMocks();document.body.innerHTML='';document.documentElement.lang='';});
it('requires the exact production URL and affirmative desktop Google Chrome evidence',()=>{
 document.documentElement.lang='ko';expect(diagnosticPageIsSafe(browser())).toBe(true);
 for(const href of ['https://www.picnic.fan/ko/vote?','https://www.picnic.fan/ko/vote#','https://www.picnic.fan/ko/vote/','https://preview.vercel.app/ko/vote','http://www.picnic.fan/ko/vote']) expect(diagnosticPageIsSafe(browser(href))).toBe(false);
});
it.each(['Edg/153','Edge/153','Whale/4','OPR/10','Opera/10','SamsungBrowser/10','CriOS/10','YaBrowser/10','HeadlessChrome/153','Android','iPhone','iPad'])('rejects derived or mobile UA %s',suffix=>{document.documentElement.lang='ko';expect(diagnosticPageIsSafe(browser(undefined,'Chrome/153 '+suffix))).toBe(false);});
it.each([null,{}, {brands:[{brand:'Chromium'}],mobile:false,platform:'Linux'}, {brands:[{brand:'Google Chrome'}],mobile:true,platform:'macOS'}, {brands:[{brand:'Google Chrome'}],mobile:false,platform:'unknown'}])('denies missing or ambiguous UAData',data=>{document.documentElement.lang='ko';expect(diagnosticPageIsSafe(browser(undefined,undefined,data))).toBe(false);});
