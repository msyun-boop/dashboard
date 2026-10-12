const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.env.ROUTINE_SOURCE || path.join(__dirname, '../routines.js'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
function mergeMaps(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!Object.keys(value).length) target[key] = {};
      else {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        mergeMaps(target[key], value);
      }
    } else target[key] = value;
  }
}
const initial = () => ({
  routines: {r1:{name:'독서',start:'2026-10-05',end:null},r2:{name:'운동',start:'2026-10-05',end:null}},
  checks: {'r1_2026-10-06':true}
});
function harness({data=initial(), backup, delayed=false}={}) {
  const storage=new Map(), refs=[], writes=[], queued=[];
  if(backup) storage.set('dashboard-routines-v1:alice',JSON.stringify(backup));
  const server={alice:clone(data),bob:{routines:{},checks:{}}};
  let error=null;
  const context=vm.createContext({
    Intl,Date,JSON,Object,Array,String,Math,Uint8Array,
    crypto: require('node:crypto').webcrypto,
    document:{getElementById:()=>null},
    window:{addEventListener:()=>{}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    prompt:()=> '수정된 독서', confirm:()=>true, currentUser:{uid:'alice'}, esc:s=>String(s||''),
    db:{collection:collection=>({doc:uid=>({collection:sub=>({doc:name=>{
      const ref={
        uid,path:[collection,uid,sub,name].join('/'),
        onSnapshot(...args){
          const opts=typeof args[0]==='object'?args.shift():{};
          ref.options=opts;[ref.next,ref.fail]=args;return ()=>{ref.stopped=true;};
        },
        set(patch,opts){
          writes.push({path:ref.path,patch:clone(patch),opts:clone(opts)});
          const perform=()=>{
            if(error) throw Object.assign(new Error(error),{code:error});
            mergeMaps(server[uid],clone(patch));
            if(!ref.stopped) ref.next(snapshot(server[uid],false));
          };
          if(delayed) return new Promise((resolve,reject)=>queued.push(()=>{
            try{perform();resolve();}catch(e){reject(e);}
          }));
          try{perform();return Promise.resolve();}catch(e){return Promise.reject(e);}
        }
      };refs.push(ref);return ref;
    }})})})}
  });
  vm.runInContext(source,context);
  vm.runInContext("routineToday=()=> '2026-10-12';setupRoutines({uid:'alice'});",context);
  function snapshot(value,fromCache,exists=true) {
    return {exists,metadata:{fromCache,hasPendingWrites:false},data:()=>clone(value)};
  }
  return {
    context,storage,server,refs,writes,
    run:code=>vm.runInContext(code,context),
    read:code=>JSON.parse(JSON.stringify(vm.runInContext(code,context))),
    emit:(value=server.alice,fromCache=false,exists=true,ref=refs.at(-1))=>ref.next(snapshot(value,fromCache,exists)),
    fail:code=>{error=code;},
    release:()=>{assert.ok(queued.length,'a write must be pending');queued.shift()();},
    backup:()=>JSON.parse(storage.get('dashboard-routines-v1:alice'))
  };
}
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
test('check-only saves preserve all routines and historical checks',async()=>{
  const h=harness();h.emit();h.run("checkRoutine('r1','2026-10-12',true)");await settle();
  assert.deepEqual(h.server.alice.routines,initial().routines);
  assert.equal(h.server.alice.checks['r1_2026-10-06'],true);
  assert.equal(h.server.alice.checks['r1_2026-10-12'],true);
  assert.equal(Object.hasOwn(h.writes[0].patch,'routines'),false);
});
test('editing a routine preserves check history and other routines',async()=>{
  const h=harness();h.emit();h.run("editRoutine('r1')");await settle();
  assert.deepEqual(h.server.alice.checks,initial().checks);
  assert.equal(h.server.alice.routines.r1.name,'수정된 독서');
  assert.deepEqual(h.server.alice.routines.r2,initial().routines.r2);
  assert.equal(Object.hasOwn(h.writes[0].patch,'checks'),false);
});
test('empty cache snapshot cannot erase the device backup',()=>{
  const data=initial(),h=harness({backup:{data,pending:{routines:{},checks:{}}}});
  h.emit({},true,false);
  assert.deepEqual(h.read('routineData'),data);
  assert.deepEqual(h.backup().data,data);
  assert.equal(h.read('routineReady'),false);
  assert.match(h.read('routineMessage'),/기기 기록 유지/);
});
test('stale cache does not replace the more recent device backup',()=>{
  const data=initial();data.routines.r1.name='최근 기기 이름';data.checks['r1_2026-10-06']=false;
  const h=harness({backup:{data,pending:{routines:{},checks:{}}}});
  h.emit(initial(),true);
  assert.deepEqual(h.read('routineData'),data);
  h.emit(initial(),false);
  assert.deepEqual(h.read('routineData'),initial());
});
test('metadata changes trigger authoritative sync and pending replay',async()=>{
  const data=initial(),pending={routines:{},checks:{'r2_2026-10-12':true}};
  const h=harness({backup:{data,pending}});
  assert.equal(h.refs[0].options.includeMetadataChanges,true);
  h.emit(data,true);await settle();assert.equal(h.writes.length,0);
  h.emit(data,false);await settle();
  assert.equal(h.server.alice.checks['r2_2026-10-12'],true);
  assert.deepEqual(h.server.alice.routines,initial().routines);
  assert.deepEqual(h.backup().pending,{routines:{},checks:{}});
});
test('failed saves retain pending data across reload, then retry safely',async()=>{
  const h=harness();h.emit();h.fail('unavailable');
  h.run("checkRoutine('r2','2026-10-12',true)");await settle();
  assert.equal(h.backup().pending.checks['r2_2026-10-12'],true);
  assert.match(h.read('routineMessage'),/저장 실패/);
  const again=harness({backup:h.backup()});
  again.emit({},true,false);assert.equal(again.read("routineData.checks['r2_2026-10-12']"),true);
  again.emit();await settle();
  assert.equal(again.server.alice.checks['r2_2026-10-12'],true);
  assert.deepEqual(again.server.alice.routines,initial().routines);
});
test('rapid opposite checks are serialized without losing the later value',async()=>{
  const h=harness({delayed:true});h.emit();
  h.run("checkRoutine('r1','2026-10-12',true);checkRoutine('r1','2026-10-12',false);");
  assert.equal(h.writes.length,1);h.release();await settle();
  assert.equal(h.writes.length,2);h.release();await settle();
  assert.equal(h.server.alice.checks['r1_2026-10-12'],false);
  assert.deepEqual(h.server.alice.routines,initial().routines);
  assert.deepEqual(h.backup().pending,{routines:{},checks:{}});
});
test('week boundaries cover Mondays through Sundays across years and leap days',()=>{
  const h=harness();
  assert.equal(h.run("monday('2026-10-11')"),'2026-10-05');
  assert.equal(h.run("monday('2026-10-12')"),'2026-10-12');
  assert.equal(h.run("monday('2027-01-01')"),'2026-12-28');
  assert.equal(h.run("dayShift('2024-02-28',1)"),'2024-02-29');
  assert.deepEqual(h.read("routineDates('2026-12-28')"),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
});
test('weekly counts and comparisons use active routine dates',()=>{
  const h=harness();h.emit();
  assert.deepEqual(h.read("routineStats('2026-10-05','r1')"),{done:1,total:7,pct:14});
  assert.deepEqual(h.read("routineStats('2026-10-05')"),{done:1,total:14,pct:7});
  assert.equal(h.run("routineDiff({pct:50},{pct:25})"),'+25%p');
  assert.equal(h.run("routineDiff({pct:0},{pct:null})"),'비교 기록 없음');
});
test('deleting a routine preserves past records and stops future dates',async()=>{
  const h=harness();h.emit();h.run("deleteRoutine('r1')");await settle();
  assert.equal(h.server.alice.routines.r1.end,'2026-10-13');
  assert.equal(h.server.alice.checks['r1_2026-10-06'],true);
  assert.deepEqual(h.read("routineStats('2026-10-05','r1')"),{done:1,total:7,pct:14});
  assert.equal(h.run("routineActive(routineData.routines.r1,'2026-10-13')"),false);
});
test('the main dashboard document and other accounts stay untouched',async()=>{
  const h=harness();h.emit();
  h.run("checkRoutine('r1','2026-10-12',true)");await settle();
  const old=h.refs[0];
  h.run("currentUser={uid:'bob'};setupRoutines(currentUser)");
  h.emit(initial(),false,true,old);
  assert.deepEqual(h.read('routineData'),{routines:{},checks:{}});
  assert.deepEqual(h.server.bob,{routines:{},checks:{}});
  assert.ok(h.writes.every(w=>w.path==='users/alice/data/routines-v1'));
});
test('an authoritative missing document replaces stale backup, keeping unsaved edits',()=>{
  const data=initial(),pending={routines:{},checks:{'r2_2026-10-12':true}};
  const h=harness({data:{routines:{},checks:{}},backup:{data,pending}});
  h.emit({},false,false);
  assert.deepEqual(h.read('routineData.routines'),{});
  assert.equal(h.read("routineData.checks['r2_2026-10-12']"),true);
});
