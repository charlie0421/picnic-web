'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Building2, CheckCircle2, LockKeyhole, Send } from 'lucide-react';
import { validateBusinessFields, type BusinessFields, type BusinessFieldErrors } from '@/lib/charts/business';
import type { BusinessCopy } from '@/lib/charts/business-copy';
import chart from './charts.module.css';
import styles from './business.module.css';

const empty: BusinessFields = { company: '', email: '', message: '', consent: false };
type Status = 'idle' | 'busy' | 'success' | 'error' | 'rateLimited' | 'conflict' | 'invalid';

export default function BusinessInquiryForm({ locale, copy: c }: { locale: string; copy: BusinessCopy }) {
  const [fields, setFields] = useState<BusinessFields>(empty);
  const [errors, setErrors] = useState<BusinessFieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const id = (name: string) => `${prefix}-${name}`;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (status !== 'idle' && status !== 'busy') result.current?.focus(); }, [status]);

  const change = <K extends keyof BusinessFields>(name: K, value: BusinessFields[K]) => {
    setFields(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || status === 'conflict') return;
    const nextErrors = validateBusinessFields(fields);
    setErrors(nextErrors);
    const first = (Object.keys(nextErrors) as (keyof BusinessFields)[])[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    busy.current = true;
    setStatus('busy');
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      // An uncertain response must be retried with the same UUID, including after edits.
      requestId.current ??= crypto.randomUUID();
      const response = await fetch('/api/kpop-chart/business', {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId.current, company: fields.company.trim(), email: fields.email.trim(), message: fields.message.trim(), locale, consent: fields.consent }),
      });
      const data: unknown = await response.json();
      const value = data && typeof data === 'object' && 'status' in data ? data.status : null;
      if (response.ok && value === 'accepted') { setFields(empty); requestId.current = null; setStatus('success'); }
      else if (response.status === 409 && value === 'conflict') setStatus('conflict');
      else if (response.status === 429 && value === 'rate_limited') setStatus('rateLimited');
      else if (response.status === 400 && value === 'invalid') setStatus('invalid');
      else setStatus('error');
    } catch { setStatus('error'); }
    finally { clearTimeout(timer); busy.current = false; controller.current = null; }
  }

  return <section className={`${chart.dashboard} ${styles.page}`} aria-labelledby={id('title')}>
    <div className={styles.shell}>
      <a className={styles.back} href={`/${locale}/charts`}><ArrowLeft size={17} aria-hidden="true" />{c.back}</a>
      <header className={`${chart.hero} ${styles.hero}`}>
        <div className={chart.heroOrbit} aria-hidden="true"><Building2 size={120} strokeWidth={.7} /></div>
        <div className={chart.eyebrow}><span className={chart.heroMark}>PICNIC</span> FOR BUSINESS</div>
        <h1 id={id('title')}>{c.title}</h1><p>{c.subtitle}</p>
      </header>
      <div className={styles.grid}>
        <aside className={styles.intro}><span className={chart.sectionKicker}>FAN INTELLIGENCE</span><h2>{c.introTitle}</h2><p>{c.introBody}</p><div className={styles.security}><LockKeyhole size={19} aria-hidden="true" /><p>{c.security}</p></div></aside>
        <div className={styles.card}>
          {status === 'success' ? <div className={styles.success} ref={result} tabIndex={-1} role="status"><CheckCircle2 size={38} aria-hidden="true" /><h2>{c.successTitle}</h2><p>{c.success}</p><a href={`/${locale}/charts`}>{c.back}<ArrowUpRight size={17} aria-hidden="true" /></a></div> : <>
            <p className={styles.required}>{c.required}</p>
            <form ref={form} noValidate onSubmit={submit} aria-busy={status === 'busy'}>
              <fieldset disabled={status === 'busy'} className={styles.fields}>
                {(['company', 'email', 'message'] as const).map(name => <div className={styles.field} key={name}>
                  <label htmlFor={id(name)}>{c[name]}</label>
                  <p id={id(`${name}-hint`)} className={styles.hint}>{c[`${name}Hint`]}</p>
                  {name === 'message' ? <textarea id={id(name)} name={name} value={fields[name]} onChange={event => change(name, event.target.value)} rows={7} required aria-invalid={!!errors[name]} aria-describedby={`${id(`${name}-hint`)}${errors[name] ? ` ${id(`${name}-error`)}` : ''}`} /> : <input id={id(name)} name={name} type={name === 'email' ? 'email' : 'text'} autoComplete={name === 'company' ? 'organization' : 'email'} value={fields[name]} onChange={event => change(name, event.target.value)} required aria-invalid={!!errors[name]} aria-describedby={`${id(`${name}-hint`)}${errors[name] ? ` ${id(`${name}-error`)}` : ''}`} />}
                  {errors[name] && <p className={styles.fieldError} id={id(`${name}-error`)}>{c[`${name}Error`]}</p>}
                </div>)}
                <div className={styles.consent}>
                  <label htmlFor={id('consent')}><input id={id('consent')} name="consent" type="checkbox" checked={fields.consent} onChange={event => change('consent', event.target.checked)} required aria-invalid={!!errors.consent} aria-describedby={`${id('decline')}${errors.consent ? ` ${id('consent-error')}` : ''}`} /><span>{c.consent}</span></label>
                  <p id={id('decline')} className={styles.hint}>{c.decline}</p>
                  <a href={`/${locale}/privacy`} target="_blank" rel="noopener noreferrer">{c.privacy}<ArrowUpRight size={14} aria-hidden="true" /></a>
                  {errors.consent && <p id={id('consent-error')} className={styles.fieldError}>{c.consentError}</p>}
                </div>
              </fieldset>
              <div aria-live="polite" aria-atomic="true">
                {status !== 'idle' && status !== 'busy' && <div className={styles.error} ref={result} tabIndex={-1} role="alert"><p>{c[status]}</p>{status === 'conflict' && <button type="button" onClick={() => { requestId.current = null; setStatus('idle'); }}>{c.newRequest}</button>}</div>}
              </div>
              <button className={styles.submit} type="submit" disabled={status === 'busy' || status === 'conflict'}><Send size={17} aria-hidden="true" />{status === 'busy' ? c.busy : c.submit}</button>
            </form>
          </>}
        </div>
      </div>
    </div>
  </section>;
}
