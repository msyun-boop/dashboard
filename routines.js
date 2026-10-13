// Independent user data document. Main dashboard data is never written here.
let routineData = {routines:{}, checks:{}}, routinePending = {routines:{}, checks:{}};
let routineRef = null, routineUnsub = null, routineUid = null, routineBusy = false, routineReady = false;
let routineWeek = monday(routineToday()), routineMessage = '연결 확인 중…';
function routineToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
function dayShift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monday(date){const d=new Date(date+'T12:00:00Z');return dayShift(date,-((d.getUTCDay()+6)%7));}
function routineActive(r,date){return routineWithinLifetime(r,date)&&routineDaysFor(r,date).includes(routineWeekday(date));}
function routineDates(week){return Array.from({length:7},(_,i)=>dayShift(week,i));}
function routineStats(week,id){let done=0,total=0;routineDates(week).forEach(date=>Object.entries(routineData.routines).forEach(([key,r])=>{if((!id||id===key)&&routineActive(r,date)){total++;if(routineData.checks[key+'_'+date])done++;}}));return {done,total,pct:total?Math.round(done/total*100):null};}
function routineRate(s){return s.pct===null?'—':s.pct+'%';}
function routineDiff(a,b){return a.pct===null||b.pct===null?'비교 기록 없음':`${a.pct-b.pct>0?'+':''}${a.pct-b.pct}%p`;}
function routineKey(){return 'dashboard-routines-v1:'+routineUid;}
function routineBackup(){try{localStorage.setItem(routineKey(),JSON.stringify({data:routineData,pending:routinePending}));return true;}catch(e){routineMessage='기기 저장 실패 · 저장 공간을 확인하세요';return false;}}
function stopRoutines(){if(routineUnsub)routineUnsub();routineUnsub=null;routineRef=null;routineUid=null;routineReady=false;routineBusy=false;routineData={routines:{},checks:{}};routinePending={routines:{},checks:{}};if(routineView)routineView.reset();rRoutine();}
function setupRoutines(user){stopRoutines();routineUid=user.uid;routineWeek=monday(routineToday());routineMessage='연결 확인 중…';try{const cached=JSON.parse(localStorage.getItem(routineKey())||'null');if(cached){routineData=cached.data;routinePending=cached.pending;}}catch(e){routineMessage='기기 기록을 읽지 못했습니다';}
 routineRef=db.collection('users').doc(user.uid).collection('data').doc('routines-v1');const uid=user.uid;
 routineUnsub=routineRef.onSnapshot({includeMetadataChanges:true},snap=>{
  if(uid!==routineUid)return;
  const d=snap.exists?snap.data():{},fromCache=!!(snap.metadata&&snap.metadata.fromCache);
  // Keep the device backup until an authoritative server snapshot arrives.
  const base=fromCache?routineData:{routines:{},checks:{}};
  routineData={routines:{...(d.routines||{}),...base.routines,...routinePending.routines},checks:{...(d.checks||{}),...base.checks,...routinePending.checks}};
  routineReady=!fromCache;
  routineMessage=fromCache?'기기 기록 유지 · 클라우드 연결 확인 중…':'동기화됨';
  routineBackup();rRoutine();flushRoutines();
 },e=>{if(uid!==routineUid)return;routineReady=false;routineMessage='클라우드 연결 실패 ('+e.code+') · 기기에 보관 중';rRoutine();});rRoutine();}
function routinePatch(type,key,value){routineData[type][key]=value;routinePending[type][key]=value;routineMessage=routineBackup()?'기기에 저장됨 · 클라우드 저장 중…':routineMessage;rRoutine();flushRoutines();}
async function flushRoutines(){
 if(!routineRef||!routineReady||routineBusy)return;
 const patch=JSON.parse(JSON.stringify(routinePending));
 // Firestore merge writes replace maps when an empty map is supplied.
 // Omit untouched maps so checks and routine edits preserve each other's data.
 const payload=Object.fromEntries(Object.entries(patch).filter(([,values])=>Object.keys(values).length));
 if(!Object.keys(payload).length)return;
 routineBusy=true;
 const ref=routineRef,uid=routineUid;
 try{
  await ref.set(payload,{merge:true});
  if(uid!==routineUid)return;
  for(const type of ['routines','checks'])for(const key of Object.keys(patch[type]))if(JSON.stringify(routinePending[type][key])===JSON.stringify(patch[type][key]))delete routinePending[type][key];
  routineMessage='클라우드 저장 완료';routineBackup();
 }catch(e){
  if(uid!==routineUid)return;
  routineMessage='클라우드 저장 실패 ('+e.code+') · 기기 기록 유지, 재시도하세요';
 }finally{if(uid===routineUid){routineBusy=false;rRoutine();}}
 if(uid===routineUid&&routineMessage==='클라우드 저장 완료')flushRoutines();
}

const ROUTINE_ALL_DAYS=[0,1,2,3,4,5,6],ROUTINE_DAY_NAMES=['월','화','수','목','금','토','일'];
let routineView=null;
function routineWeekNumber(week){return Math.ceil(Number(week.slice(8))/7);}
function routineWeekLabel(week){return Number(week.slice(5,7))+'월 '+routineWeekNumber(week)+'주차';}
function routineWeekday(date){return (new Date(date+'T12:00:00Z').getUTCDay()+6)%7;}
function routineWithinLifetime(r,date){return r.start<=date&&(!r.end||date<r.end);}
function routineNormalizeDays(days){return Array.from(new Set((Array.isArray(days)?days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))).sort((a,b)=>a-b);}
function routineDaysFor(r,date){const versions=(Array.isArray(r.schedule)?r.schedule:[]).filter(v=>v.from<=date).sort((a,b)=>a.from.localeCompare(b.from));return versions.length?routineNormalizeDays(versions[versions.length-1].days):routineNormalizeDays(r.days||ROUTINE_ALL_DAYS);}
function routineScheduleLabel(days){if(days.length===7)return '월~일';if(days.length===5&&days.every((d,i)=>d===i))return '월~금';return days.map(d=>ROUTINE_DAY_NAMES[d]).join('·');}
function routineApplySchedule(r,days,week){const next=dayShift(week,7),versions=Array.isArray(r.schedule)?r.schedule:[],hasMidweek=versions.some(v=>v.from>week&&v.from<next);if(JSON.stringify(routineDaysFor(r,week))===JSON.stringify(days)&&!hasMidweek)return {...r};return {...r,schedule:[...versions.filter(v=>v.from<week||v.from>=next),{from:week,days:days.slice()}].sort((a,b)=>a.from.localeCompare(b.from))};}
function saveRoutineEdit(id,name,days,week){const r=routineData.routines[id],normalized=routineNormalizeDays(days),clean=String(name||'').trim().slice(0,120);if(!r||!clean||!normalized.length)return false;const revised=routineApplySchedule(r,normalized,week||routineWeek);routinePatch('routines',id,{...revised,name:clean});return true;}
function createRoutine(name,days,week){const clean=String(name||'').trim().slice(0,120),normalized=routineNormalizeDays(days);if(!clean||!normalized.length)return null;const id='r'+Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''),start=week||routineWeek;routinePatch('routines',id,{name:clean,start,end:null,schedule:[{from:start,days:normalized}]});return id;}
function archiveRoutine(id){const r=routineData.routines[id];if(r&&!r.end)routinePatch('routines',id,{...r,end:dayShift(routineToday(),1)});}
function routineDailyStats(date){const rows=Object.entries(routineData.routines).filter(([,r])=>routineActive(r,date)),done=rows.filter(([id])=>routineData.checks[id+'_'+date]).length;return {done,total:rows.length,pct:rows.length?Math.round(done/rows.length*100):null};}
function routineEscape(value){return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function moveRoutineWeek(n){routineWeek=n===0?monday(routineToday()):dayShift(routineWeek,n*7);rRoutine();}
function addRoutine(event){if(event)event.preventDefault();if(routineView)return routineView.add();}
function editRoutine(id){if(routineView&&routineData.routines[id])routineView.edit(id);}
function deleteRoutine(id){if(routineData.routines[id]&&confirm('루틴을 삭제할까요? 과거 체크 기록은 보존되며 내일부터 체크표에서 제외됩니다.'))archiveRoutine(id);}
function checkRoutine(id,date,checked){const r=routineData.routines[id];if(r&&routineActive(r,date))routinePatch('checks',id+'_'+date,!!checked);}
function rRoutine(){const root=document.getElementById('v-routine');if(root){if(!routineView)routineView=createRoutineView(root);routineView.render();}rRoutineBoard();if(typeof window.renderRoutineMobile==='function')window.renderRoutineMobile();}
function showTodayRoutines(){routineWeek=monday(routineToday());if(typeof showTab==='function')showTab('routine');else rRoutine();}
function rRoutineBoard(){
 const root=document.getElementById('routine-board-summary');if(!root)return;
 if(!routineUid){root.innerHTML='';return;}
 const today=routineToday(),rows=Object.entries(routineData.routines).filter(([,r])=>routineActive(r,today)),s=routineDailyStats(today),week=monday(today),w=routineStats(week);
 root.innerHTML='<section class="rp-panel"><div class="rp-today-header"><div><h3>오늘의 루틴</h3><p class="rp-muted">'+Number(today.slice(5,7))+'월 '+Number(today.slice(8))+'일 · '+ROUTINE_DAY_NAMES[routineWeekday(today)]+'요일</p></div><strong class="rp-today-count" aria-live="polite">'+(s.total?'오늘 '+s.done+'/'+s.total+' 완료 · '+s.pct+'%':'오늘 예정된 루틴 없음')+'</strong><button class="rp-button" type="button" data-action="details">루틴 자세히</button><a class="rp-button" href="routine.html">휴대폰 전용 화면</a></div><div class="rp-mini-track" role="progressbar" aria-label="오늘 루틴 달성률" aria-valuemin="0" aria-valuemax="100" '+(s.pct!==null?'aria-valuenow="'+s.pct+'"':'')+'><div class="rp-mini-fill" style="width:'+(s.total?s.done/s.total*100:0)+'%"></div></div><div class="rp-today-list">'+(rows.map(([id,r])=>'<label class="rp-today-item '+(routineData.checks[id+'_'+today]?'done':'')+'"><input class="rp-check" type="checkbox" data-id="'+routineEscape(id)+'" data-date="'+today+'" aria-label="오늘 '+routineEscape(r.name)+'" '+(routineData.checks[id+'_'+today]?'checked':'')+'><span class="rp-today-name">'+routineEscape(r.name)+'</span></label>').join('')||'<span class="rp-muted">오늘은 쉬는 날이에요.</span>')+'</div><p class="rp-board-week">'+routineWeekLabel(week)+' · '+(w.total?'이번 주 '+w.done+'/'+w.total+'회 완료 · '+routineRate(w):'예정된 루틴 없음')+'</p></section>';
 root.onchange=event=>{if(event.target.matches('.rp-check'))checkRoutine(event.target.dataset.id,event.target.dataset.date,event.target.checked);};
 root.onclick=event=>{const button=event.target.closest('[data-action="details"]');if(button&&root.contains(button))showTodayRoutines();};
}
window.addEventListener('online',()=>flushRoutines());
window.addEventListener('focus',()=>rRoutine());
if(typeof window.setInterval==='function')window.setInterval(()=>{if(routineUid){rRoutineBoard();if(typeof window.renderRoutineMobile==='function')window.renderRoutineMobile();}},60000);
function retryRoutines(){if(!routineReady&&currentUser)setupRoutines(currentUser);else flushRoutines();}

const ROUTINE_MARKUP="\n<div class=\"rp-toolbar\"><h2>하루 루틴</h2><a class=\"rp-button\" href=\"routine.html\">휴대폰 전용 화면</a><button class=\"rp-button cursor-interaction\" type=\"button\" data-action=\"previous\" aria-label=\"이전 주\">‹ 이전 주</button><strong class=\"rp-week-label\" data-role=\"week\"></strong><button class=\"rp-button cursor-interaction\" type=\"button\" data-action=\"next\" aria-label=\"다음 주\">다음 주 ›</button><button class=\"rp-button cursor-interaction\" type=\"button\" data-action=\"today\">이번 주</button></div>\n<div class=\"rp-save-row\"><p class=\"rp-status\" data-role=\"status\" role=\"status\"></p><button class=\"rp-button\" type=\"button\" data-action=\"retry\">저장 재시도</button></div>\n<div class=\"rp-overview-grid\">\n<section class=\"rp-panel\">\n<h3 data-role=\"summary-heading\">선택한 주 전체 달성률</h3><p class=\"rp-muted\" data-role=\"summary-period\"></p>\n<div class=\"rp-donut-area\"><div class=\"rp-donut\" data-role=\"donut\" role=\"img\" aria-label=\"전체 달성률\"><div class=\"rp-donut-center\"><strong class=\"rp-donut-percent\" data-role=\"donut-percent\">—</strong><span class=\"rp-donut-caption\">목표 달성률</span></div></div></div>\n<div class=\"rp-counts\" aria-live=\"polite\"><div><span class=\"rp-count-label\">목표</span><strong class=\"rp-count-number\" data-role=\"target-count\">0회</strong></div><div><span class=\"rp-count-label\">완료</span><strong class=\"rp-count-number\" data-role=\"done-count\">0회</strong></div><div><span class=\"rp-count-label\">남음</span><strong class=\"rp-count-number\" data-role=\"remaining-count\">0회</strong></div></div>\n<p class=\"rp-comparison\" data-role=\"summary-comparison\"></p><p class=\"rp-summary-note\" data-role=\"summary-note\"></p>\n</section>\n<section class=\"rp-panel\"><h3>주별 목표 달성률</h3><p class=\"rp-muted\">최근 8주 · 최신 주부터 · 완료 횟수 / 목표 횟수</p><div class=\"rp-trend\" data-role=\"trend\" role=\"img\" aria-label=\"최근 8주 주별 목표 달성률\"></div></section>\n</div>\n<section class=\"rp-panel\">\n<form class=\"rp-form\" data-role=\"add-form\"><input class=\"rp-input\" id=\"routine-new\" name=\"routine-name\" type=\"text\" maxlength=\"120\" placeholder=\"새 루틴 이름\" aria-label=\"새 루틴 이름\" required><label class=\"rp-repeat-label\">반복 요일 <select class=\"rp-select cursor-interaction\" data-role=\"add-schedule\" aria-label=\"새 루틴 반복 요일\"><option value=\"all\">월~일</option><option value=\"weekdays\">월~금</option><option value=\"custom\">요일 선택</option></select></label><button class=\"rp-button primary cursor-interaction\" type=\"button\" data-action=\"add\">루틴 추가</button></form><div class=\"rp-days\" data-role=\"add-days\" hidden></div><p class=\"rp-picker-error\" data-role=\"add-error\" role=\"alert\"></p>\n<p class=\"rp-muted\">추가한 루틴은 선택한 주의 월요일부터 적용됩니다. 요일을 설정할 수 있고, 삭제해도 과거 체크 기록은 유지됩니다.</p>\n</section>\n<section class=\"rp-panel\">\n<h3 data-role=\"weekly-heading\" aria-live=\"polite\"></h3><p class=\"rp-muted\" data-role=\"weekly-description\"></p>\n<div class=\"rp-scroll\"><table class=\"rp-table\" aria-label=\"월요일부터 일요일까지 루틴 체크표\"><thead data-role=\"table-head\"></thead><tbody data-role=\"table-body\"></tbody><tfoot data-role=\"table-foot\"></tfoot></table></div>\n</section>\n\n<dialog data-role=\"edit-dialog\" aria-labelledby=\"rp-edit-heading\"><form method=\"dialog\" data-role=\"edit-form\"><h3 id=\"rp-edit-heading\">루틴 수정</h3><label class=\"rp-edit-label\">이름</label><input class=\"rp-input rp-dialog-input\" name=\"edit-name\" aria-label=\"수정할 루틴 이름\" maxlength=\"120\" required><label class=\"rp-repeat-label\">반복 요일 <select class=\"rp-select cursor-interaction\" data-role=\"edit-schedule\" aria-label=\"루틴 반복 요일\"><option value=\"all\">월~일</option><option value=\"weekdays\">월~금</option><option value=\"custom\">요일 선택</option></select></label><div class=\"rp-days\" data-role=\"edit-days\" hidden></div><p class=\"rp-muted\" data-role=\"edit-effective\"></p><p class=\"rp-picker-error\" data-role=\"edit-error\" role=\"alert\"></p><div class=\"rp-dialog-actions\"><button class=\"rp-button cursor-interaction\" type=\"button\" data-action=\"cancel-edit\">취소</button><button class=\"rp-button primary cursor-interaction\" type=\"button\" data-action=\"save-edit\">저장</button></div></form></dialog><dialog data-role=\"delete-dialog\" aria-labelledby=\"rp-delete-heading\"><form method=\"dialog\"><h3 id=\"rp-delete-heading\">루틴을 삭제할까요?</h3><p class=\"rp-muted\">과거 체크 기록은 보존되며 내일부터 체크표에서 제외됩니다.</p><div class=\"rp-dialog-actions\"><button class=\"rp-button cursor-interaction\" type=\"button\" data-action=\"cancel-delete\" value=\"cancel\">취소</button><button class=\"rp-button primary cursor-interaction\" type=\"button\" data-action=\"save-delete\" value=\"delete\">삭제</button></div></form></dialog>";
function createRoutineView(root){root.innerHTML=ROUTINE_MARKUP;

const role=name=>root.querySelector('[data-role="'+name+'"]');let today=routineToday();
const shift=dayShift;
const dates=routineDates;
const escape=routineEscape;
const state={get week(){return routineWeek;},set week(value){routineWeek=value;},get routines(){return routineData.routines;},get checks(){return routineData.checks;}};
let editingId=null,deletingId=null,editingWeek=null;
const allDays=ROUTINE_ALL_DAYS,dayNames=ROUTINE_DAY_NAMES;
const weekNumber=routineWeekNumber,weekLabel=routineWeekLabel;
const weekday=routineWeekday;
const withinLifetime=routineWithinLifetime;
const daysFor=routineDaysFor;
const active=routineActive;
const displayScheduleDate=()=>state.week;
const editEffectiveDate=()=>editingWeek||state.week;
function scheduleLabel(days){if(days.length===7)return '월~일';if(days.length===5&&days.every((d,i)=>d===i))return '월~금';return days.map(d=>dayNames[d]).join('·');}
function setupPickers(){for(const prefix of ['add','edit']){role(prefix+'-days').innerHTML=dayNames.map((name,i)=>'<label class="rp-day-chip cursor-interaction"><input class="rp-day-input" type="checkbox" value="'+i+'" checked aria-label="'+(prefix==='add'?'새 루틴 ':'루틴 ')+name+'요일">'+name+'</label>').join('');}setPicker('add',allDays);}
function setPicker(prefix,days){role(prefix+'-schedule').value=days.length===7?'all':days.length===5&&days.every((d,i)=>d===i)?'weekdays':'custom';role(prefix+'-days').querySelectorAll('input').forEach(input=>input.checked=days.includes(Number(input.value)));role(prefix+'-days').hidden=role(prefix+'-schedule').value!=='custom';role(prefix+'-error').textContent='';}
function pickerDays(prefix){const mode=role(prefix+'-schedule').value;return mode==='all'?allDays.slice():mode==='weekdays'?[0,1,2,3,4]:Array.from(role(prefix+'-days').querySelectorAll('input:checked'),input=>Number(input.value)).sort((a,b)=>a-b);}
function validatePicker(prefix){if(pickerDays(prefix).length){role(prefix+'-error').textContent='';return true;}role(prefix+'-error').textContent='요일을 하나 이상 선택해 주세요.';return false;}


const stats=routineStats;
const daily=routineDailyStats;
const rate=routineRate,diff=routineDiff;

function comparisonText(a,b){if(a.pct===null)return '목표 없음';if(b.pct===null)return '직전 주에 비교할 목표가 없어요';const delta=a.pct-b.pct;return delta===0?'직전 주와 달성률이 같아요':'직전 주보다 '+Math.abs(delta)+'%p '+(delta>0?'높아요':'낮아요');}
function progressCell(id,previous){const s=stats(state.week,id),remaining=s.total-s.done;return '<td class="rp-progress-cell"><div class="rp-progress-top"><strong>'+rate(s)+'</strong><small>'+s.done+'/'+s.total+'회 완료</small></div><div class="rp-mini-track" role="progressbar" aria-label="'+escape(state.routines[id].name)+' 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(s.pct||0)+'"><div class="rp-mini-fill" style="width:'+(s.total?s.done/s.total*100:0)+'%"></div></div><small class="rp-progress-bottom">남은 목표 '+remaining+'회 · 직전 주 '+diff(s,stats(previous,id))+'</small></td>';}
function renderOverview(summary,previous){
const remaining=summary.total-summary.done;
role('summary-heading').textContent=(state.week===monday(today)?'이번 주':'선택한 주')+' 전체 달성률';
role('summary-period').textContent=weekNumber(state.week)+'주차';
role('donut').style.setProperty('--rp-pct',summary.total?summary.done/summary.total*100:0);
role('donut-percent').textContent=summary.total?rate(summary):'—';
role('donut').setAttribute('aria-label',summary.total?'목표 '+summary.total+'회 중 '+summary.done+'회 완료, '+remaining+'회 남음, 달성률 '+rate(summary):'목표 없음');
role('target-count').textContent=summary.total+'회';role('done-count').textContent=summary.done+'회';role('remaining-count').textContent=remaining+'회';
role('summary-comparison').textContent=comparisonText(summary,stats(previous));
role('summary-note').textContent=!summary.total?'루틴을 추가하면 달성률이 표시됩니다.':summary.done===summary.total?'이 주의 목표를 모두 완료했어요.':'설정한 요일의 목표만 계산해요. 남은 목표에는 앞으로의 날짜도 포함돼요.';
}
function renderHistory(){role('trend').innerHTML=Array.from({length:8},(_,i)=>{const week=shift(state.week,-i*7),s=stats(week),tag=week===monday(today)?'진행 중':week>monday(today)?'예정':i===0?'선택한 주':'';return '<div class="rp-bar rp-history-row '+(i===0?'is-selected':'')+'" aria-label="'+weekLabel(week)+', '+(s.total?s.done+'/'+s.total+'회 완료, '+rate(s):'예정된 루틴 없음')+'"><div class="rp-history-label">'+weekLabel(week)+'<small>'+(s.total?s.done+'/'+s.total+'회 완료':'예정 없음')+(tag?' · '+tag:'')+'</small></div><div class="rp-history-track"><div class="rp-horizontal-fill" style="width:'+(s.total?s.done/s.total*100:0)+'%"></div></div><span class="rp-history-value">'+rate(s)+'</span></div>';}).join('');}

function render(){
today=routineToday();
const weekDays=dates(state.week),previous=shift(state.week,-7),summary=stats(state.week),rows=Object.entries(state.routines).filter(([,r])=>weekDays.some(d=>active(r,d)));
role('week').textContent=weekLabel(state.week);role('status').textContent=routineMessage;
role('weekly-heading').textContent='주간 루틴 체크표';renderOverview(summary,previous);
role('weekly-description').textContent='설정한 요일만 체크 · 쉬는 날은 목표에서 제외';
role('table-head').innerHTML='<tr><th scope="col">루틴</th>'+weekDays.map((d,i)=>'<th scope="col" class="'+(d===today?'rp-today':'')+'">'+['월','화','수','목','금','토','일'][i]+'<br>'+d.slice(5)+'</th>').join('')+'<th scope="col">루틴별 진행</th></tr>';
role('table-body').innerHTML=rows.map(([id,r])=>'<tr><th scope="row"><div class="rp-name">'+escape(r.name)+(r.end?' (삭제됨)':'')+'</div><span class="rp-schedule-tag">'+escape(scheduleLabel(daysFor(r,displayScheduleDate())))+'</span><div class="rp-actions"><button type="button" class="rp-button cursor-interaction" data-action="edit" data-id="'+escape(id)+'" aria-label="'+escape(r.name)+' 수정">수정</button>'+(!r.end?'<button type="button" class="rp-button cursor-interaction" data-action="delete" data-id="'+escape(id)+'" aria-label="'+escape(r.name)+' 삭제">삭제</button>':'')+'</div></th>'+weekDays.map(d=>'<td class="'+(d===today?'rp-today':'')+'">'+(active(r,d)?'<label class="rp-check-label cursor-interaction"><input class="rp-check cursor-interaction" type="checkbox" data-id="'+escape(id)+'" data-date="'+d+'" aria-label="'+escape(r.name)+' '+d+'" '+(state.checks[id+'_'+d]?'checked':'')+'></label>':(withinLifetime(r,d)?'<span class="rp-rest">쉬는 날</span>':'—'))+'</td>').join('')+progressCell(id,previous)+'</tr>').join('')||'<tr><td colspan="9">루틴을 추가해 하루를 기록해 보세요.</td></tr>';
role('table-foot').innerHTML='<tr><th scope="row">일별 달성률<br><small class="rp-small">지난주 같은 요일 대비</small></th>'+weekDays.map(d=>'<td>'+rate(daily(d))+'<br><small class="rp-small">'+diff(daily(d),daily(shift(d,-7)))+'</small></td>').join('')+'<td>'+rate(summary)+'</td></tr>';
renderHistory();rRoutineBoard();
}
root.addEventListener('change',event=>{const input=event.target;for(const prefix of ['add','edit'])if(input===role(prefix+'-schedule')){const mode=input.value;if(mode!=='custom')role(prefix+'-days').querySelectorAll('input').forEach(day=>day.checked=mode==='all'||Number(day.value)<5);role(prefix+'-days').hidden=mode!=='custom';role(prefix+'-error').textContent='';return;}if(input.matches('.rp-check'))checkRoutine(input.dataset.id,input.dataset.date,input.checked);});
root.addEventListener('click',event=>{
const button=event.target.closest('[data-action]');if(!button||!root.contains(button))return;
const action=button.dataset.action;


if(action==='retry'){retryRoutines();return;}
if(action==='add'){addPreviewRoutine();return;}
if(action==='save-edit'){const dialog=role('edit-dialog');if(!dialog.querySelector('input').reportValidity()||!validatePicker('edit'))return;if(!saveRoutineEdit(editingId,dialog.querySelector('input').value,pickerDays('edit'),editingWeek))return;dialog.close('save');return;}
if(action==='save-delete'){archiveRoutine(deletingId);role('delete-dialog').close('delete');return;}
if(action==='cancel-edit'){role('edit-dialog').close('cancel');return;}
if(action==='cancel-delete'){role('delete-dialog').close('cancel');return;}
if(action==='previous')state.week=shift(state.week,-7);else if(action==='next')state.week=shift(state.week,7);else if(action==='today')state.week=monday(today);
else if(action==='edit'){openEdit(button.dataset.id);return;}
else if(action==='delete'){deletingId=button.dataset.id;const dialog=role('delete-dialog');dialog.returnValue='';dialog.showModal();return;}else return;
render();
});
function addPreviewRoutine(){const input=role('add-form').querySelector('input');if(!input.value.trim()){input.reportValidity();return;}if(!validatePicker('add'))return;if(createRoutine(input.value,pickerDays('add'),state.week))input.value='';}
role('add-form').addEventListener('submit',event=>{event.preventDefault();addPreviewRoutine();});
role('add-form').querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addPreviewRoutine();}});
role('edit-dialog').querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();role('edit-dialog').querySelector('[data-action="save-edit"]').click();}});
role('edit-dialog').addEventListener('close',()=>{editingId=null;editingWeek=null;});
role('delete-dialog').addEventListener('close',()=>{deletingId=null;});

setupPickers();render();

function openEdit(id){if(!state.routines[id])return;editingId=id;editingWeek=state.week;const dialog=role("edit-dialog");dialog.returnValue="";dialog.querySelector("input").value=state.routines[id].name;setPicker("edit",daysFor(state.routines[id],editingWeek));role("edit-effective").textContent=weekLabel(editingWeek)+"부터 요일 변경이 적용됩니다. 그 이전 주의 기록은 유지돼요.";dialog.showModal();}
return {render,add:addPreviewRoutine,edit:openEdit,reset(){for(const name of ["edit-dialog","delete-dialog"]){const dialog=role(name);if(dialog.open)dialog.close("cancel");}editingId=null;editingWeek=null;deletingId=null;role("add-form").querySelector("input").value="";setPicker("add",allDays);}};

}
