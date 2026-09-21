'use client';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileText, Search, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { type FilingChunk, type RetrievalResult, makeFilingChunks, retrieveGroundedChunks } from '@/lib/bm25';
import { type Report, type MetricKey, labels, valueOf, valuation } from '@/lib/filing';
const DEFAULT_ANALYZER_API_URL='http://localhost:8000/';
const LAMBDA_URL=import.meta.env.VITE_ANALYZER_API_URL||import.meta.env.NEXT_PUBLIC_ANALYZER_API_URL||DEFAULT_ANALYZER_API_URL;
const DEFAULT_FILING_URL='https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/c636d8a7-8025-47d2-9b13-bcf5465343b3.html';
const DEFAULT_COMPANY='Apple';
const DEFAULT_YEAR='2025';
const money = (n:number|null) => {
 if(n===null)return '—';
 const abs=Math.abs(n);
 return abs>=1000?'$'+(n/1000).toLocaleString('en-US',{maximumFractionDigits:1})+'b':'$'+n.toLocaleString('en-US',{maximumFractionDigits:1})+'m';
};
type LambdaMetrics={revenue?:number;cost_of_revenue?:number;gross_profit?:number;operating_expenses?:number;operating_income?:number;net_income?:number;diluted_eps?:number;operating_cash_flow?:number;capex?:number;free_cash_flow?:number;capital_return?:number;cash?:number;total_assets?:number;total_liabilities?:number;long_term_debt?:number;shareholders_equity?:number;shares?:number;employees?:number};
type LambdaSections={business?:string;products_services?:string;risk_factors?:string;document?:string};
type LambdaResponse={error?:string;company?:string;period?:string;method?:string;metrics?:LambdaMetrics;sections?:LambdaSections};
type AnalyzePayload={url?:string;company?:string;year?:string};
type ChatMessage={role:'user'|'assistant';content:string;results?:RetrievalResult[]};
const remoteMetricMap:Record<keyof LambdaMetrics,MetricKey>={revenue:'revenue',cost_of_revenue:'costOfRevenue',gross_profit:'grossProfit',operating_expenses:'operatingExpenses',operating_income:'operatingIncome',net_income:'income',diluted_eps:'dilutedEps',operating_cash_flow:'cashflow',capex:'capex',free_cash_flow:'freeCashFlow',capital_return:'capitalReturn',cash:'cash',total_assets:'assets',total_liabilities:'liabilities',long_term_debt:'debt',shareholders_equity:'equity',shares:'shares',employees:'employees'};
const emptyMetrics=():Report['metrics']=>Object.fromEntries(Object.keys(labels).map(key=>[key,{value:null,source:''}])) as Report['metrics'];
function applyRemoteMetrics(report:Report,data:LambdaResponse,sourceLabel:string){for(const [source,target] of Object.entries(remoteMetricMap) as [keyof LambdaMetrics,MetricKey][]){const value=data.metrics?.[source];if(typeof value==='number')report.metrics[target]={value,source:sourceLabel};}}
function remoteExcerpts(data:LambdaResponse):Report['excerpts']{const excerpts:Report['excerpts']=[];if(data.sections?.business)excerpts.push({title:'Business overview',text:data.sections.business,source:'Item 1. Business'});if(data.sections?.products_services)excerpts.push({title:'Products & services',text:data.sections.products_services,source:'Item 1. Business'});if(data.sections?.risk_factors)excerpts.push({title:'Risk factors',text:data.sections.risk_factors,source:'Item 1A. Risk Factors'});return excerpts;}
function retrievalSections(data:LambdaResponse,excerpts:Report['excerpts']){
 const sections:{title:string;source:string;text:string}[]=[];
 if(data.sections?.document)sections.push({title:'Full filing text',source:'10-K filing',text:data.sections.document});
 sections.push(...excerpts);
 return sections;
}
const metricSearchTerms:Partial<Record<MetricKey,string>>={
 revenue:'revenue net sales sales top line',
 costOfRevenue:'cost of revenue cost of sales cost of goods sold',
 grossProfit:'gross profit gross margin profitability',
 operatingExpenses:'operating expenses costs expense base',
 operatingIncome:'operating income operating profit operations earnings',
 income:'net income profit earnings how much money the company made',
 dilutedEps:'diluted eps earnings per share per-share profit',
 cashflow:'operating cash flow cash from operations liquidity',
 capex:'capital expenditures capex property plant equipment investment',
 freeCashFlow:'free cash flow operating cash flow less capital expenditures',
 capitalReturn:'share repurchases dividends capital return buybacks',
 cash:'cash cash equivalents liquidity',
 assets:'total assets balance sheet assets',
 liabilities:'total liabilities balance sheet obligations',
 debt:'long-term debt debt borrowings credit maturities',
 equity:'shareholders equity stockholders equity book value',
 shares:'diluted shares shares outstanding share count',
 employees:'employees headcount workforce people team members',
};
function metricSections(report:Report){
 return (Object.keys(labels) as MetricKey[]).flatMap(key=>{
  const metric=report.metrics[key];
  if(metric.value===null)return [];
  const value=key==='shares'||key==='employees'?metric.value.toLocaleString('en-US',{maximumFractionDigits:1}):key==='dilutedEps'?'$'+metric.value.toLocaleString('en-US',{maximumFractionDigits:2}):money(metric.value);
  return [{title:'Financial facts',source:metric.source||'Extracted 10-K fact',text:`${labels[key]} was ${value}. ${metricSearchTerms[key]||labels[key].toLowerCase()}.`}];
 });
}
function sentences(text:string){return text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);}
const dollarMetric=(key:MetricKey)=>key!=='shares'&&key!=='employees';
const displayScale=(key:MetricKey,value:number|null)=>dollarMetric(key)&&value!==null&&Math.abs(value)>=1000?1000:1;
const displayUnit=(key:MetricKey,value:number|null)=>key==='shares'?'millions':displayScale(key,value)===1000?'USD billions':'USD millions';
type FundamentalEntry={label:string;metric?:MetricKey;detail:string;deduct?:boolean;hideWhenMissing?:boolean};
const fundamentals:{title:string;caption:string;entries:FundamentalEntry[]}[]=[
 {title:'Income statement',caption:'Revenue and earnings power',entries:[{label:'Revenue / net sales',metric:'revenue',detail:'Top-line sales for the fiscal year'},{label:'Cost of revenue / cost of sales',metric:'costOfRevenue',detail:'Direct cost of goods or services sold',deduct:true,hideWhenMissing:true},{label:'Gross profit',metric:'grossProfit',detail:'Revenue less cost of revenue',hideWhenMissing:true},{label:'Operating expenses',metric:'operatingExpenses',detail:'Total operating expense line item',deduct:true},{label:'Operating income',metric:'operatingIncome',detail:'Income from operations'},{label:'Net income',metric:'income',detail:'Profit attributable to common shareholders'},{label:'Diluted EPS',metric:'dilutedEps',detail:'Earnings per diluted share'}]},
 {title:'Balance sheet',caption:'Liquidity, assets, and capital structure',entries:[{label:'Cash and cash equivalents',metric:'cash',detail:'Reported cash balance'},{label:'Total assets',metric:'assets',detail:'Total assets at period end'},{label:'Total debt / long-term debt',metric:'debt',detail:'Debt balance currently available'},{label:'Total liabilities',metric:'liabilities',detail:'Total liabilities at period end'},{label:'Shareholders’ equity',metric:'equity',detail:'Reported stockholders’ equity'},{label:'Diluted shares outstanding',metric:'shares',detail:'Weighted-average diluted shares'}]},
 {title:'Cash flow',caption:'Cash generation and capital return',entries:[{label:'Operating cash flow',metric:'cashflow',detail:'Cash from operations'},{label:'Capital expenditures',metric:'capex',detail:'Purchases of property, plant and equipment',deduct:true},{label:'Free cash flow',metric:'freeCashFlow',detail:'Operating cash flow less capital expenditures'},{label:'Share repurchases / dividends',metric:'capitalReturn',detail:'Cash returned through buybacks and dividends',deduct:true}]},
];
function fundamentalValue(report:Report,entry:FundamentalEntry){if(!entry.metric)return '—';const value=valueOf(report,entry.metric);if(value===null)return '—';let formatted=entry.metric==='shares'?value.toLocaleString('en-US',{maximumFractionDigits:1})+'m':entry.metric==='dilutedEps'?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):money(value);return entry.deduct?'('+formatted+')':formatted;}
function fundamentalSource(report:Report,entry:FundamentalEntry){if(!entry.metric)return entry.detail;const metric=report.metrics[entry.metric];return metric.value===null?'Not separately reported in this filing':entry.detail;}
function visibleFundamentalEntries(report:Report,entries:FundamentalEntry[]){return entries.filter(entry=>!entry.hideWhenMissing||!entry.metric||valueOf(report,entry.metric)!==null);}
function people(n:number|null){return n===null?'—':Math.round(n).toLocaleString('en-US');}
async function parseAnalyzerResponse(res:Response):Promise<LambdaResponse>{
 const text=await res.text();
 if(!text)return {};
 try{return JSON.parse(text) as LambdaResponse;}
 catch{
  const message=text.length>180?text.slice(0,180)+'…':text;
  return {error:message||'Analyzer returned a non-JSON response.'};
 }
}
export default function Home(){
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[reviewed,setReviewed]=useState(false);
 const [low,setLow]=useState('15'),[high,setHigh]=useState('25'),[price,setPrice]=useState(''),[filingUrl,setFilingUrl]=useState(DEFAULT_FILING_URL);
 const [companyQuery,setCompanyQuery]=useState(DEFAULT_COMPANY),[filingYear,setFilingYear]=useState(DEFAULT_YEAR);
 const [activeFundamental,setActiveFundamental]=useState(0);
 const [activeNarrative,setActiveNarrative]=useState(0);
 const [filingChunks,setFilingChunks]=useState<FilingChunk[]>([]);
 const [chatInput,setChatInput]=useState('');
 const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
 const chatEndRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[chatMessages]);
 async function runAnalysis(payload:AnalyzePayload,filename:string){if(busy)return;setBusy(true);setError('');setStatus('Fetching SEC filing…');try{const res=await fetch(LAMBDA_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await parseAnalyzerResponse(res);if(!res.ok)throw Error(data.error||`Analyzer request failed with status ${res.status}.`);if(data.error)throw Error(data.error);const excerpts=remoteExcerpts(data);const next:Report={company:data.company||'Company name not found',period:data.period||'',filename,method:'SEC HTML extraction',metrics:emptyMetrics(),notes:['Analysis returned from SEC filing extraction.'],excerpts};applyRemoteMetrics(next,data,'SEC filing · inline XBRL');const chunks=makeFilingChunks([...retrievalSections(data,excerpts),...metricSections(next)]);setReport(next);setFilingChunks(chunks);setChatMessages([]);setChatInput('');setReviewed(false);setActiveNarrative(0);setPrice('');setStatus(`Analysis ready. Indexed ${chunks.length.toLocaleString('en-US')} filing chunks for BM25 chat.`);}catch(e){setError(e instanceof Error?e.message:'Unable to analyze filing.');setStatus('');setFilingChunks([]);setChatMessages([]);}finally{setBusy(false);}}
 async function analyzeCompany(){if(!companyQuery||!filingYear||busy)return;await runAnalysis({company:companyQuery,year:filingYear},`${companyQuery} · ${filingYear} 10-K`);}
 async function analyzeUrl(){if(!filingUrl||busy)return;await runAnalysis({url:filingUrl},filingUrl);}
 function askFiling(e:FormEvent){e.preventDefault();const query=chatInput.trim();if(!query||!filingChunks.length)return;const results=retrieveGroundedChunks(query,filingChunks,5);const content=results.length?`Top filing passages for "${query}" ranked by BM25 and filing-term matches.`:`No indexed filing passage matched "${query}". Try a filing-specific question about revenue, risks, products, debt, cash flow, or employees.`;setChatMessages(messages=>[...messages,{role:'user',content:query},{role:'assistant',content,results}]);setChatInput('');}
 function update(key:MetricKey,v:string){if(!report)return;const current=report.metrics[key].value,scale=displayScale(key,current);setReport({...report,metrics:{...report.metrics,[key]:{...report.metrics[key],value:v===''?null:Number(v)*scale,manual:true}}});setReviewed(false);}
 const net=report?valueOf(report,'income'):null,rev=report?valueOf(report,'revenue'):null,shares=report?valueOf(report,'shares'):null;
 const range=valuation(net,shares,low,high), margin=net!==null&&rev!==null&&rev>0?net/rev*100:null;
 const activeStatement=fundamentals[activeFundamental]||fundamentals[0];
 const activeStatementEntries=report?visibleFundamentalEntries(report,activeStatement.entries):activeStatement.entries;
 const narrativeTabs=report?.excerpts||[];
 const activeNarrativeTab=narrativeTabs[activeNarrative]||narrativeTabs[0];
 return <><header className="topbar"><a className="wordmark" href="https://isha-portfolio.vishaalsudarsan.chatgpt.site">Isha.</a><span className="appmark">FILING NOTES <span>/</span> 10-K ANALYZER</span><a className="back" href="https://isha-portfolio.vishaalsudarsan.chatgpt.site/#work">Back to portfolio <ArrowUpRight size={16}/></a></header>
 <main><div className="heading"><div><p className="eyebrow">RESEARCH, WITH A CLEARER VIEW</p><h1>From filing to <em>perspective.</em></h1><p className="intro">Understand the business. Review the numbers. Explore what it could be worth.</p></div><span className="edition">01 / FINANCIAL RESEARCH</span></div>
 <form className="lookup-form" onSubmit={e=>{e.preventDefault();void analyzeCompany();}}><div><label htmlFor="company-query">Company or ticker</label><input id="company-query" value={companyQuery} onChange={e=>setCompanyQuery(e.target.value)} placeholder="Apple, JPM, TSLA" aria-label="Company or ticker"/></div><div><label htmlFor="filing-year">Fiscal year</label><input id="filing-year" value={filingYear} onChange={e=>setFilingYear(e.target.value)} placeholder="2025" aria-label="Fiscal year"/></div><button type="submit" disabled={busy||!companyQuery||!filingYear}>Find 10-K</button></form><details className="url-details"><summary>Use a filing URL instead</summary><div className="url-form"><input value={filingUrl} onChange={e=>setFilingUrl(e.target.value)} placeholder="Paste SEC filing HTML URL" aria-label="SEC filing URL"/><button onClick={()=>void analyzeUrl()} disabled={busy||!filingUrl}>Analyze URL</button></div></details><p className="status" role="status">{status}</p>{error&&<p role="alert" className="error">{error}</p>}
 {!report?<section className="empty-layout"><div className="empty-title"><p className="eyebrow">YOUR RESEARCH DESK</p><h2>A long report.<br/>A focused view.</h2><p>Enter a company and fiscal year to pull the 10-K directly from SEC filings.</p></div><div className="steps">{[['01','The business at a glance','Business and risk excerpts drawn directly from the filing.'],['02','Financial fundamentals','Revenue, earnings, cash flow, and the source behind each figure.'],['03','A valuation you can question','An editable earnings-multiple range, with every assumption visible.']].map(([n,t,d])=><div key={n}><span>{n}</span><section><h3>{t}</h3><p>{d}</p></section></div>)}</div></section>:<>
 <section className="report-heading"><div><p className="eyebrow">{report.sample?'ILLUSTRATIVE SAMPLE · NOT A REAL COMPANY':report.period?'FISCAL YEAR ENDED '+report.period:'SEC ANNUAL FILING'}</p><h2>{report.company}</h2></div><span className="badge"><FileText size={15}/> Research brief</span></section>
 <div className="metrics">{[['Revenue',money(rev),'Reported fiscal year · USD'],['Net income',money(net),'Reported fiscal year · USD'],['Net margin',margin===null?'—':margin.toFixed(1)+'%','Calculated from revenue and net income'],['Operating cash flow',money(valueOf(report,'cashflow')),'Reported fiscal year · USD'],['Employees',people(valueOf(report,'employees')),'From Item 1 disclosure']].map(([t,v,s])=><article key={t}><p>{t}</p><strong>{v}</strong><span>{s}</span></article>)}</div>
 <div className="dashboard"><div>{activeNarrativeTab&&<section className="panel summary"><p className="eyebrow">01 / BUSINESS OVERVIEW</p><h2>{activeNarrativeTab.title==='Business overview'?'The business, in brief.':activeNarrativeTab.title+'.'}</h2><div className="statement-tabs" role="tablist" aria-label="Business section view">{narrativeTabs.map((section,i)=><button key={section.title} type="button" role="tab" aria-selected={activeNarrative===i} className={activeNarrative===i?'active':''} onClick={()=>setActiveNarrative(i)}>{section.title}</button>)}</div><div className="excerpt">{activeNarrativeTab.source.includes('Risk Factors')?<ul className="risk-list">{sentences(activeNarrativeTab.text).map((sentence,j)=><li key={j}>{sentence}</li>)}</ul>:<p>{activeNarrativeTab.text}</p>}</div></section>}<section className="panel chat-panel"><p className="eyebrow">02 / FILING CHAT</p><h2>Ask the 10-K.</h2><form className="chat-form" onSubmit={askFiling}><Search size={18}/><input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Ask about risks, revenue drivers, debt, products..." aria-label="Ask the filing" disabled={!filingChunks.length}/><button type="submit" disabled={!filingChunks.length||!chatInput.trim()} aria-label="Search filing"><Send size={18}/></button></form><div className="chat-log">{chatMessages.length===0?<div className="chat-empty"><strong>{filingChunks.length.toLocaleString('en-US')} chunks indexed</strong><span>BM25 will return the most relevant passages from this 10-K.</span></div>:chatMessages.map((message,i)=><article key={i} className={'chat-message '+message.role}><p>{message.content}</p>{message.results&&<div className="retrieval-results">{message.results.map(result=><section key={result.id}><div><strong>{result.title}</strong><span>{result.score>0?'Score '+result.score.toFixed(2):'Grounded context'} · {result.source}</span></div><p>{result.text}</p></section>)}</div>}</article>)}<div ref={chatEndRef}/></div></section><section className="panel fundamentals-panel"><p className="eyebrow">03 / SOURCE FIGURES</p><h2>Review the fundamentals.</h2><p className="muted">A statement-level snapshot from the filing. Large dollar amounts are shown in billions; shares are shown in millions.</p><div className="statement-tabs" role="tablist" aria-label="Financial statement view">{fundamentals.map((section,i)=><button key={section.title} type="button" role="tab" aria-selected={activeFundamental===i} className={activeFundamental===i?'active':''} onClick={()=>setActiveFundamental(i)}>{section.title}</button>)}</div><article className="statement" role="tabpanel"><div className="statement-head"><h3>{activeStatement.title}</h3><span>{activeStatement.caption}</span></div><div className="statement-lines">{activeStatementEntries.map(entry=><div className="statement-line" key={entry.label}><div><strong>{entry.label}</strong><p>{fundamentalSource(report,entry)}</p></div><span className={entry.deduct?'deduct':''}>{fundamentalValue(report,entry)}</span></div>)}</div></article></section></div>
 <aside><section className="valuation"><p className="eyebrow">04 / VALUATION LENS</p><h2>What could it<br/>be worth?</h2><p>Explore an earnings-based equity value using your own P/E assumptions.</p><div className="range"><span>INDICATIVE VALUE PER SHARE</span><strong>{range&&!range.error?'$'+range.low.toFixed(2)+' – $'+range.high.toFixed(2):'Needs inputs'}</strong><small>{reviewed?'Based on your reviewed inputs':'Provisional · review source figures first'}</small></div><div className="scenario">{['low','high'].map((s,i)=><div key={s}><span>{i?'Upper case':'Lower case'}</span><div className="bar-track"><div style={{width:i?'100%':(Number(low)/Number(high)*100||0)+'%'}}/></div><strong>{i?high:low}× earnings</strong></div>)}</div><div className="assumptions"><label>Lower P/E multiple<Input type="number" min="1" step="1" value={low} onChange={e=>setLow(e.target.value)}/></label><label>Upper P/E multiple<Input type="number" min="1" step="1" value={high} onChange={e=>setHigh(e.target.value)}/></label></div><label className="price">Share price to compare (USD)<Input type="number" min="0.01" step="any" placeholder="Enter price manually" value={price} onChange={e=>setPrice(e.target.value)}/></label>{range?.error&&<p role="alert">{range.error}</p>}{range&&!range.error&&Number(price)>0&&<p className="comparison">{((range.low/Number(price)-1)*100).toFixed(1)}% to {((range.high/Number(price)-1)*100).toFixed(1)}% relative to your entered price.</p>}
 <details><summary>How this valuation works</summary><p>Equity value = net income × assumed P/E. Per-share value = equity value ÷ diluted weighted-average shares. The illustrative 15–25× defaults are not company-specific estimates or peer benchmarks. This model is unsuitable for losses and can be distorted by one-time earnings, debt, or dilution. Share price is entered manually; no live market data is used.</p><a href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/approach.html" target="_blank" rel="noreferrer">Valuation methodology · NYU Stern ↗</a></details></section><div className="aside-note"><span>READ THE CONTEXT</span><p>A valuation is a set of assumptions, not a price prediction. Use this research aid alongside the full filing.</p></div></aside></div></>}
 <footer><span className="wordmark">Isha.</span><p>Filing Notes · An independent research tool</p><span>Built for a closer look.</span></footer></main></>;
}
