/* Presentation only. Authentication and all routine writes use the shared core. */
(function(){
'use strict';
const root=document.getElementById('routine-mobile-root');
if(!root)return;
const get=name=>root.querySelector('[data-role="'+name+'"]');
const all=[0,1,2,3,4,5,6];
let view='today',editing=null,deleting=null,editWeek=null,lastUid=null,lastToday=routineToday();
let cardSignature='',listSignature='',manageSignature='';
root.innerHTML=`
<section data-role="today-view">
 <section class="rm-card" aria-label="오늘 하루 루틴">
  <header class="rm-card-head"><div class="rm-brand"><span class="rm-logo" aria-hidden="true">✓</span><div><h2>하루 루틴</h2><p class="rm-date" data-role="today-date"></p></div></div><span class="rm-count" data-role="card-count" aria-live="polite"></span></header>
  <div class="rm-divider"></div><p class="rm-empty" data-role="card-empty" hidden>오늘 예정된 루틴이 없어요. 루틴 관리에서 추가하거나 요일을 확인해 주세요.</p>
  <div class="rm-grid" data-role="card-grid"></div><div class="rm-card-foot"><span>오늘의 목표</span><strong data-role="card-rate"></strong></div>
 </section>
 <div style="margin-top:12px;text-align:right"><button class="rm-button small" type="button" data-action="all">전체 목록 보기</button></div>
</section>
<section data-role="list-view" hidden><div class="rm-section-head"><div><h2>오늘의 루틴</h2><p class="rm-sub" data-role="list-summary"></p></div><button class="rm-button small" type="button" data-action="today">카드로 보기</button></div><div class="rm-list" data-role="today-list"></div></section>
<section data-role="week-view" hidden>
 <div class="rm-week-nav"><button class="rm-button small" type="button" data-action="previous" aria-label="이전 주">‹ 이전 주</button><strong data-role="week-label"></strong><button class="rm-button small" type="button" data-action="next" aria-label="다음 주">다음 주 ›</button></div>
 <div class="rm-week-total"><p class="rm-sub">주간 목표 달성률</p><p class="rm-rate" data-role="week-rate"></p><p class="rm-sub" data-role="week-count"></p><div class="rm-track" style="margin-top:12px" role="progressbar" aria-label="주간 달성률" aria-valuemin="0" aria-valuemax="100" data-role="week-progress"><div class="rm-fill" data-role="week-fill"></div></div><p class="rm-sub" style="margin-top:8px">설정한 요일의 전체 주간 목표 기준</p></div>
 <div class="rm-section-head"><h2 style="font-size:16px">일별 달성률</h2><button class="rm-button small" type="button" data-action="current">이번 주</button></div><div data-role="week-days"></div>
</section>
<section data-role="manage-view" hidden>
 <div class="rm-section-head"><h2>루틴 관리</h2><span class="rm-sub" data-role="manage-week"></span></div>
 <form class="rm-form-panel" data-role="add-form"><label class="rm-field-label" for="rm-new-name">루틴 이름</label><input class="rm-field" id="rm-new-name" data-role="new-name" name="name" placeholder="새 루틴 이름" maxlength="120" required><label class="rm-field-label" for="rm-add-schedule">반복 요일</label><select class="rm-field" id="rm-add-schedule" data-role="add-schedule"><option value="all">월~일</option><option value="weekdays">월~금</option><option value="custom">요일 선택</option></select><div class="rm-days" data-role="add-days" hidden></div><p class="rm-error" data-role="add-error" role="alert"></p><button class="rm-button primary" type="submit" data-action="add">루틴 추가</button><p class="rm-sub" style="margin-top:8px" data-role="add-period"></p></form>
 <div class="rm-list" data-role="manage-list"></div>
</section>
<div class="rm-save"><p data-role="save-status" role="status" aria-live="polite"></p><button class="rm-button small" type="button" data-action="retry">저장 재시도</button></div>
<nav class="rm-nav" aria-label="하루 루틴 메뉴"><button type="button" data-action="today" data-role="today-tab">오늘 체크</button><button type="button" data-action="week" data-role="week-tab">주간 통계</button><button type="button" data-action="manage" data-role="manage-tab">루틴 관리</button></nav>
<dialog data-role="edit-dialog" aria-labelledby="rm-edit-title"><h2 id="rm-edit-title">루틴 수정</h2><form data-role="edit-form"><label class="rm-field-label" for="rm-edit-name">이름</label><input class="rm-field" id="rm-edit-name" data-role="edit-name" name="name" required maxlength="120"><label class="rm-field-label" for="rm-edit-schedule">반복 요일</label><select class="rm-field" id="rm-edit-schedule" data-role="edit-schedule"><option value="all">월~일</option><option value="weekdays">월~금</option><option value="custom">요일 선택</option></select><div class="rm-days" data-role="edit-days" hidden></div><p class="rm-sub" data-role="edit-period" style="margin-top:10px"></p><p class="rm-error" data-role="edit-error" role="alert"></p><div class="rm-dialog-actions"><button class="rm-button" type="button" data-action="cancel-edit">취소</button><button class="rm-button primary" type="submit" data-action="save-edit">저장</button></div></form></dialog>
<dialog data-role="delete-dialog" aria-labelledby="rm-delete-title"><h2 id="rm-delete-title">루틴을 삭제할까요?</h2><p class="rm-sub" data-role="delete-name"></p><p class="rm-sub" style="margin-top:8px">과거 체크 기록은 유지되고 내일부터 체크 목록에서 제외됩니다.</p><div class="rm-dialog-actions"><button class="rm-button" type="button" data-action="cancel-delete">취소</button><button class="rm-button primary" type="button" data-action="delete">삭제</button></div></dialog>`;
function schedule(r,date){return typeof routineDaysFor==='function'?routineDaysFor(r,date):r.days||all;}
function scheduleLabel(days){return days.length===7?'월~일':days.length===5&&days.every((d,i)=>d===i)?'월~금':days.map(d=>ROUTINE_DAY_NAMES[d]).join('·');}
function dayLabel(date){const day=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;return Number(date.slice(5,7))+'월 '+Number(date.slice(8))+'일 '+ROUTINE_DAY_NAMES[day]+'요일';}
function getRows(today){return Object.entries(routineData.routines).filter(([,r])=>routineActive(r,today));}
function focusAfterUpdate(container,action){const focused=document.activeElement,inside=container.contains(focused),id=inside&&focused.dataset.id,kind=inside&&focused.dataset.action;action();if(inside&&id){const target=Array.from(container.querySelectorAll('[data-id]')).find(node=>node.dataset.id===id&&node.tagName===focused.tagName&&node.dataset.action===kind);if(target)target.focus({preventScroll:true});}}
function checkMarkup(id,r,date,card){const checked=!!routineData.checks[id+'_'+date],name=routineEscape(r.name);return '<label class="'+(card?'rm-tile':'rm-list-item')+(checked?' is-done':'')+'" title="'+name+'"><input class="rm-check" type="checkbox" data-id="'+routineEscape(id)+'" data-date="'+date+'" aria-label="'+name+'" '+(checked?'checked':'')+' '+(!routineUid?'disabled':'')+'><span class="rm-copy"><span class="'+(card?'rm-name':'rm-list-name')+'">'+name+'</span><span class="'+(card?'rm-state':'rm-sub')+'" data-check-label>'+ (card?(checked?'완료':'체크하기'):scheduleLabel(schedule(r,date)))+'</span></span></label>';}
function syncChecks(container){container.querySelectorAll('.rm-check').forEach(input=>{const checked=!!routineData.checks[input.dataset.id+'_'+input.dataset.date];input.checked=checked;input.disabled=!routineUid;const label=input.closest('label');label.classList.toggle('is-done',checked);const caption=label.querySelector('.rm-state');if(caption)caption.textContent=checked?'완료':'체크하기';});}
function renderCard(rows,today){
 const shown=rows.slice(0,5),more=rows.length-shown.length,signature=JSON.stringify([routineUid,today,shown.map(([id,r])=>[id,r.name]),more]);
 if(cardSignature!==signature){let markup=shown.map(([id,r])=>checkMarkup(id,r,today,true)).join('');if(!rows.length)markup+='<button class="rm-tile rm-action-tile" type="button" data-action="manage"><span class="rm-copy"><span class="rm-name">루틴 관리</span><span class="rm-state">추가·요일 설정</span></span></button>';markup+=more?'<button class="rm-tile rm-action-tile" type="button" data-action="all" aria-label="전체 루틴 보기"><span class="rm-copy"><span class="rm-name">전체 루틴 보기</span><span class="rm-state">'+more+'개 더</span></span></button>':'<button class="rm-tile rm-action-tile" type="button" data-action="week"><span class="rm-copy"><span class="rm-name">주간 통계</span><span class="rm-state">'+routineWeekLabel(monday(today))+'</span></span></button>';focusAfterUpdate(get('card-grid'),()=>get('card-grid').innerHTML=markup);cardSignature=signature;}
 syncChecks(get('card-grid'));
}
function renderList(rows,today){const signature=JSON.stringify([routineUid,today,rows.map(([id,r])=>[id,r.name,schedule(r,today)])]);if(listSignature!==signature){focusAfterUpdate(get('today-list'),()=>get('today-list').innerHTML=rows.map(([id,r])=>checkMarkup(id,r,today,false)).join('')||'<p class="rm-empty">오늘 예정된 루틴이 없어요.</p>');listSignature=signature;}syncChecks(get('today-list'));}
function renderManagement(){const rows=Object.entries(routineData.routines).filter(([,r])=>!r.end),signature=JSON.stringify([routineUid,routineWeek,rows.map(([id,r])=>[id,r.name,schedule(r,routineWeek)])]);if(manageSignature!==signature){focusAfterUpdate(get('manage-list'),()=>get('manage-list').innerHTML=rows.map(([id,r])=>'<div class="rm-manage-item"><p class="rm-manage-name">'+routineEscape(r.name)+'</p><p class="rm-sub">'+scheduleLabel(schedule(r,routineWeek))+'</p><div class="rm-actions"><button class="rm-button small" type="button" data-action="edit" data-id="'+routineEscape(id)+'" aria-label="'+routineEscape(r.name)+' 수정" '+(!routineUid?'disabled':'')+'>수정</button><button class="rm-button small" type="button" data-action="ask-delete" data-id="'+routineEscape(id)+'" aria-label="'+routineEscape(r.name)+' 삭제" '+(!routineUid?'disabled':'')+'>삭제</button></div></div>').join('')||'<p class="rm-empty">등록된 루틴이 없어요. 첫 루틴을 추가해 보세요.</p>');manageSignature=signature;}}
function closeDialogs(){for(const type of ['edit','delete'])if(get(type+'-dialog').open)get(type+'-dialog').close();editing=null;deleting=null;editWeek=null;}
function render(){
 const today=routineToday();
 if(today!==lastToday){if(routineWeek===monday(lastToday))routineWeek=monday(today);lastToday=today;}
 if(lastUid!==routineUid){closeDialogs();view='today';cardSignature=listSignature=manageSignature='';lastUid=routineUid;get('add-form').reset();fillPicker('add',all);}
 const rows=getRows(today),s=routineDailyStats(today),w=routineStats(routineWeek);
 ['today','list','week','manage'].forEach(name=>get(name+'-view').hidden=view!==name);
 ['today','week','manage'].forEach(name=>{const active=name===view||(name==='today'&&view==='list');get(name+'-tab').classList.toggle('active',active);get(name+'-tab').setAttribute('aria-pressed',String(active));});
 get('today-date').textContent=dayLabel(today);get('card-count').textContent=s.total?s.done+'/'+s.total+' 완료':'쉬는 날';get('card-rate').textContent=s.total?'오늘 '+routineRate(s)+' 달성':'예정된 루틴 없음';get('card-empty').hidden=s.total!==0;
 renderCard(rows,today);renderList(rows,today);get('list-summary').textContent=dayLabel(today)+' · '+s.done+'/'+s.total+' 완료';
 get('week-label').textContent=routineWeekLabel(routineWeek);get('week-rate').textContent=routineRate(w);get('week-count').textContent=w.total?w.done+'/'+w.total+'회 완료 · 남은 목표 '+(w.total-w.done)+'회':'예정된 루틴 없음';get('week-fill').style.width=(w.total?w.done/w.total*100:0)+'%';get('week-progress').setAttribute('aria-valuenow',String(w.pct||0));
 get('week-days').innerHTML=Array.from({length:7},(_,i)=>{const date=dayShift(routineWeek,i),day=routineDailyStats(date),future=date>today;return '<div class="rm-day-row"><div class="rm-day-name">'+ROUTINE_DAY_NAMES[i]+'요일'+(date===today?' · 오늘':'')+'<p class="rm-sub">'+(!day.total?'쉬는 날':future?'예정':day.done+'/'+day.total+'개')+'</p></div><div class="rm-track" role="progressbar" aria-label="'+ROUTINE_DAY_NAMES[i]+'요일 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(day.pct||0)+'"><div class="rm-fill" style="width:'+(day.total?day.done/day.total*100:0)+'%"></div></div><span class="rm-day-rate">'+(!day.total?'—':future&&!day.done?'예정':routineRate(day))+'</span></div>';}).join('');
 get('manage-week').textContent=routineWeekLabel(routineWeek);get('add-period').textContent=routineWeekLabel(routineWeek)+'부터 적용됩니다.';renderManagement();
 get('save-status').textContent=routineUid?routineMessage:'로그인 후 루틴을 확인할 수 있어요.';
 root.querySelectorAll('[data-action="retry"], [data-role="add-form"] input, [data-role="add-form"] select, [data-role="add-form"] button').forEach(control=>control.disabled=!routineUid);
}
function fillPicker(prefix,days){get(prefix+'-schedule').value=days.length===7?'all':days.length===5&&days.every((d,i)=>d===i)?'weekdays':'custom';get(prefix+'-days').querySelectorAll('input').forEach(input=>input.checked=days.includes(Number(input.value)));get(prefix+'-days').hidden=get(prefix+'-schedule').value!=='custom';get(prefix+'-error').textContent='';}
function picker(prefix){const mode=get(prefix+'-schedule').value;return mode==='all'?all.slice():mode==='weekdays'?[0,1,2,3,4]:Array.from(get(prefix+'-days').querySelectorAll('input:checked'),input=>Number(input.value));}
function validate(prefix){const name=get(prefix==='add'?'new-name':'edit-name').value.trim();if(!name){get(prefix+'-error').textContent='루틴 이름을 입력해 주세요.';get(prefix==='add'?'new-name':'edit-name').focus();return false;}if(!picker(prefix).length){get(prefix+'-error').textContent='요일을 하나 이상 선택해 주세요.';return false;}get(prefix+'-error').textContent='';return true;}
function setView(next){view=next;if(next==='today'||next==='list')routineWeek=monday(routineToday());render();}
function submitAdd(event){event.preventDefault();if(!routineUid||!validate('add'))return;const name=get('new-name').value.trim();if(createRoutine(name,picker('add'),routineWeek)){get('new-name').value='';get('new-name').focus();}}
function submitEdit(event){event.preventDefault();if(!routineUid||!editing||!routineData.routines[editing]||!validate('edit'))return;if(saveRoutineEdit(editing,get('edit-name').value.trim(),picker('edit'),editWeek)){get('edit-dialog').close();editing=null;editWeek=null;}}
for(const prefix of ['add','edit'])get(prefix+'-days').innerHTML=ROUTINE_DAY_NAMES.map((name,i)=>'<label class="rm-day-chip"><input type="checkbox" value="'+i+'" aria-label="'+(prefix==='add'?'새 루틴 ':'루틴 ')+name+'요일">'+name+'</label>').join('');
fillPicker('add',all);
get('add-form').addEventListener('submit',submitAdd);get('edit-form').addEventListener('submit',submitEdit);
root.addEventListener('change',event=>{const input=event.target;for(const prefix of ['add','edit'])if(input===get(prefix+'-schedule')){if(input.value!=='custom')get(prefix+'-days').querySelectorAll('input').forEach(node=>node.checked=input.value==='all'||Number(node.value)<5);get(prefix+'-days').hidden=input.value!=='custom';get(prefix+'-error').textContent='';return;}if(input.matches('.rm-check')){if(!routineUid){input.checked=false;return;}checkRoutine(input.dataset.id,input.dataset.date,input.checked);}});
root.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button||!root.contains(button)||button.disabled)return;
 const action=button.dataset.action;
 if(action==='today'||action==='week'||action==='manage'||action==='all'){setView(action==='all'?'list':action);return;}
 if(action==='previous'||action==='next'||action==='current'){routineWeek=action==='current'?monday(routineToday()):dayShift(routineWeek,action==='previous'?-7:7);render();return;}
 if(action==='retry'){if(routineUid)retryRoutines();return;}
 if(action==='cancel-edit'){get('edit-dialog').close();editing=null;editWeek=null;return;}
 if(action==='cancel-delete'){get('delete-dialog').close();deleting=null;return;}
 if(!routineUid)return;
 if(action==='edit'){const r=routineData.routines[button.dataset.id];if(!r)return;editing=button.dataset.id;editWeek=routineWeek;get('edit-name').value=r.name;fillPicker('edit',schedule(r,editWeek));get('edit-period').textContent=routineWeekLabel(editWeek)+'부터 요일 변경 적용 · 이전 체크 기록 유지';get('edit-dialog').showModal();return;}
 if(action==='ask-delete'){if(!routineData.routines[button.dataset.id])return;deleting=button.dataset.id;get('delete-name').textContent=routineData.routines[deleting].name;get('delete-dialog').showModal();return;}
 if(action==='delete'){if(deleting&&routineData.routines[deleting])archiveRoutine(deleting);get('delete-dialog').close();deleting=null;}
});
get('edit-dialog').addEventListener('close',()=>{editing=null;editWeek=null;});get('delete-dialog').addEventListener('close',()=>deleting=null);
window.renderRoutineMobile=render;
render();
})();
