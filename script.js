const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBxURPwHGz17e44R1iFra7Vq63-XtioVBHrJJgsHEmeFYYs5sif5I3io_r_QJ01KLTlA/exec";/* ============ CONFIG ============ */
const CRITERIA = [
  {key:'participation', label:'المشاركة والتفاعل'},
  {key:'behavior', label:'حسن السلوك'},
  {key:'attendance', label:'الانتظام في الحضور'},
  {key:'homework', label:'أداء الواجبات'},
  {key:'cooperation', label:'التعاون مع الزملاء'},
  {key:'commitment', label:'الالتزام بالوقت'}
];
/* تقييم المعلمين/ـات: خاص بالإدارة فقط ولا يظهر أبداً في حساب المعلم/ـة */
const TEACHER_CRITERIA = [
  {key:'assessment_methods', label:'أساليب التقويم'},
  {key:'non_class_skills', label:'المهارات غير الصفية'},
  {key:'kahoot_games', label:'استخدام الألعاب اللغوية (كاهوت)'},
  {key:'punctuality', label:'الالتزام بمواعيد المحاضرات'},
  {key:'innovation', label:'الابتكار والإبداع التعليمي'},
  {key:'powerpoint', label:'عروض البوربوينت'},
  {key:'enrichment_activities', label:'الأنشطة الإثرائية'},
  {key:'ai_usage', label:'تفعيل الذكاء الاصطناعي'}
];
const REPORT_DEDUCTION_REASON = 'لم يرفع التقرير الأسبوعي';
const MAX_REPORT_IMAGES = 4;
const DATA_KEY = 'saqifah:data';
const PW_KEY = 'saqifah:admin_pw';
const DEFAULT_PW = 'admin123';

let DATA = null;
let currentAdmin = false;
let currentTeacherId = null;
let adminTab = 'rooms';
let teacherTab = 'evaluate';
let selectedTeacherRoomId = null;
let openStudentId = null;
let openTeacherEvalId = null;

/* ============ STORAGE HELPERS ============ */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function emptyData(){
  return {teachers:[], students:[], rooms:[], evaluations:[], reports:[], announcements:[], champions:{}, autoExport:false, teacherEvaluations:[], teacherDeductions:[]};
}

async function loadData(){
  try{
    const res = await window.storage.get(DATA_KEY, true);
    DATA = res && res.value ? JSON.parse(res.value) : emptyData();
  }catch(e){
    DATA = emptyData();
  }
  /* توافق مع بيانات قديمة محفوظة قبل إضافة تقييم المعلمين/ـات */
  if(!DATA.teacherEvaluations) DATA.teacherEvaluations = [];
  if(!DATA.teacherDeductions) DATA.teacherDeductions = [];
}
async function saveData(){
  try{
    await window.storage.set(DATA_KEY, JSON.stringify(DATA), true);
  }catch(e){
    toast('تعذّر حفظ البيانات، حاول مرة أخرى', true);
  }
}
async function getAdminPw(){
  try{
    const res = await window.storage.get(PW_KEY, true);
    return res && res.value ? res.value : DEFAULT_PW;
  }catch(e){ return DEFAULT_PW; }
}
async function setAdminPw(pw){
  try{ await window.storage.set(PW_KEY, pw, true); }catch(e){}
}

/* ============ UI HELPERS ============ */
function toast(msg, isErr){
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast'+(isErr?' err':'');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>{ t.style.transition='.35s'; t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(()=>t.remove(),350); }, 2200);
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  renderHeaderActions();
}

function renderHeaderActions(){
  const el = document.getElementById('headerActions');
  el.innerHTML = '';
  if(currentAdmin){
    el.innerHTML = '<span class="pill">لوحة الإدارة</span><button class="logout-btn" onclick="logoutAdmin()">تسجيل خروج</button>';
  }else if(currentTeacherId){
    const t = DATA.teachers.find(x=>x.id===currentTeacherId);
    el.innerHTML = '<span class="pill">'+(t?escapeHtml(t.name):'')+'</span><button class="logout-btn" onclick="logoutTeacher()">تسجيل خروج</button>';
  }
}

function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtDate(iso){
  try{ const d = new Date(iso); return d.toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'})+' '+d.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return iso; }
}

function starsHtml(value, clickable, onClickPrefix){
  let h = '<span class="stars">';
  for(let i=1;i<=5;i++){
    h += '<span class="star'+(i<=value?' filled':'')+(clickable?' clickable':'')+'"'+
         (clickable? ' onclick="'+onClickPrefix+i+')"':'')+'>★</span>';
  }
  h += '</span>';
  return h;
}

function avgScore(scores){
  const vals = CRITERIA.map(c=> scores && scores[c.key] ? scores[c.key] : 0);
  const sum = vals.reduce((a,b)=>a+b,0);
  return sum / CRITERIA.length; // out of 5
}

function studentAverage(studentId){
  const ev = DATA.evaluations.find(e=>e.studentId===studentId);
  if(!ev) return null;
  return avgScore(ev.scores);
}

/* ---- تقييم المعلمين/ـات (إدارة فقط) ---- */
function avgTeacherScore(scores){
  const vals = TEACHER_CRITERIA.map(c=> scores && scores[c.key] ? scores[c.key] : 0);
  const sum = vals.reduce((a,b)=>a+b,0);
  return sum / TEACHER_CRITERIA.length; // من 5
}
function teacherDeductionTotal(teacherId){
  return DATA.teacherDeductions.filter(d=>d.teacherId===teacherId).reduce((a,b)=>a+b.points,0);
}
function teacherFinalScore(teacherId){
  const ev = DATA.teacherEvaluations.find(e=>e.teacherId===teacherId);
  if(!ev) return null;
  const base = avgTeacherScore(ev.scores);
  return Math.max(0, base - teacherDeductionTotal(teacherId));
}
function lastReportOf(teacherId){
  const mine = DATA.reports.filter(r=>r.teacherId===teacherId).slice().sort((a,b)=> new Date(b.date)-new Date(a.date));
  return mine.length ? mine[0] : null;
}

/* ============ AUTH ============ */
async function adminLogin(){
  const pw = document.getElementById('adminPwInput').value;
  const real = await getAdminPw();
  if(pw === real){
    currentAdmin = true;
    document.getElementById('adminPwInput').value='';
    adminTab='rooms';
    showScreen('screen-admin');
    renderAdmin();
    toast('مرحباً بك في لوحة الإدارة');
  }else{
    document.getElementById('adminHint').textContent = 'كلمة المرور غير صحيحة';
    document.getElementById('adminHint').style.color = '#c0392b';
  }
}
function logoutAdmin(){
  currentAdmin = false;
  showScreen('screen-role');
}
function populateTeacherSelect(){
  const sel = document.getElementById('teacherSelect');
  if(DATA.teachers.length===0){
    sel.innerHTML = '<option value="">لا يوجد معلمون/معلمات مضافون بعد</option>';
    return;
  }
  sel.innerHTML = DATA.teachers.map(t=>'<option value="'+t.id+'">'+escapeHtml(t.name)+'</option>').join('');
}
function teacherLogin(){
  const sel = document.getElementById('teacherSelect');
  if(!sel.value){ toast('يرجى مطالبة الإدارة بإضافة اسمك أولاً', true); return; }
  currentTeacherId = sel.value;
  const myRooms = DATA.rooms.filter(r=>r.teacherId===currentTeacherId);
  selectedTeacherRoomId = myRooms.length ? myRooms[0].id : null;
  teacherTab = 'evaluate';
  showScreen('screen-teacher');
  renderTeacher();
  toast('تم تسجيل الدخول بنجاح');
}
function logoutTeacher(){
  currentTeacherId = null;
  showScreen('screen-role');
}

/* ============ ADMIN: NAV ============ */
const ADMIN_TABS = [
  {id:'rooms', label:'القاعات والدورات', ic:'🏫'},
  {id:'teachers', label:'المعلمون والمعلمات', ic:'🧑‍🏫'},
  {id:'teacherEval', label:'تقييم المعلمين والمعلمات', ic:'📈'},
  {id:'students', label:'الطلاب', ic:'🎓'},
  {id:'evals', label:'التقييمات', ic:'📊'},
  {id:'reports', label:'التقارير الأسبوعية', ic:'📄'},
  {id:'announce', label:'التعميمات', ic:'📢'},
  {id:'champion', label:'أفضل طالب', ic:'🏆'},
  {id:'export', label:'تصدير Excel', ic:'⬇️'},
  {id:'settings', label:'الإعدادات', ic:'⚙️'}
];

function renderAdmin(){
  renderHeaderActions();
  const nav = document.getElementById('adminNav');
  nav.innerHTML = ADMIN_TABS.map(t=>
    '<button class="side-btn'+(adminTab===t.id?' active':'')+'" onclick="setAdminTab(\''+t.id+'\')">'+
    '<span class="ic">'+t.ic+'</span>'+t.label+'</button>'
  ).join('');
  const main = document.getElementById('adminMain');
  main.innerHTML = ADMIN_RENDERERS[adminTab]();
}
function setAdminTab(id){ adminTab=id; renderAdmin(); }

/* ---- Admin: Rooms ---- */
const ADMIN_RENDERERS = {
  rooms: renderAdminRooms,
  teachers: renderAdminTeachers,
  teacherEval: renderAdminTeacherEval,
  students: renderAdminStudents,
  evals: renderAdminEvals,
  reports: renderAdminReports,
  announce: renderAdminAnnounce,
  champion: renderAdminChampion,
  export: renderAdminExport,
  settings: renderAdminSettings
};

function renderAdminRooms(){
  const teacherOptions = DATA.teachers.map(t=>'<option value="'+t.id+'">'+escapeHtml(t.name)+'</option>').join('');
  const rows = DATA.rooms.map(r=>{
    const t = DATA.teachers.find(x=>x.id===r.teacherId);
    const count = DATA.students.filter(s=>s.roomId===r.id).length;
    return '<tr><td><b>'+escapeHtml(r.name)+'</b></td><td>'+escapeHtml(r.course||'—')+'</td>'+
      '<td>'+(t? '<span class="tag">'+escapeHtml(t.name)+'</span>':'<span class="small-note">لم يُحدد</span>')+'</td>'+
      '<td>'+count+' طالب</td>'+
      '<td><button class="icon-btn" onclick="deleteRoom(\''+r.id+'\')">حذف ✕</button></td></tr>';
  }).join('');
  return `
  <h2>القاعات والدورات</h2>
  <p class="lead">أنشئ قاعة لكل دورة وحدد المعلم/ـة المسؤول/ـة عنها. سيرى المعلم/ـة قاعته تلقائياً بعد تسجيل الدخول.</p>
  <div class="card">
    <h3>إضافة قاعة جديدة</h3>
    <div class="row3">
      <div class="field"><label>اسم القاعة</label><input id="roomName" placeholder="مثال: قاعة ١"></div>
      <div class="field"><label>اسم الدورة</label><input id="roomCourse" placeholder="مثال: دورة الصيف ١٤٤٧"></div>
      <div class="field"><label>المعلم/ـة المسؤول/ـة</label><select id="roomTeacher"><option value="">— بدون تعيين —</option>${teacherOptions}</select></div>
    </div>
    <button class="btn" onclick="addRoom()">+ إضافة القاعة</button>
  </div>
  <div class="card">
    <h3>القاعات الحالية (${DATA.rooms.length})</h3>
    ${DATA.rooms.length? `<table><thead><tr><th>القاعة</th><th>الدورة</th><th>المعلم/ـة</th><th>عدد الطلاب</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">لا توجد قاعات بعد. أضف أول قاعة من الأعلى.</p>'}
  </div>`;
}
function addRoom(){
  const name = document.getElementById('roomName').value.trim();
  const course = document.getElementById('roomCourse').value.trim();
  const teacherId = document.getElementById('roomTeacher').value;
  if(!name){ toast('يرجى إدخال اسم القاعة', true); return; }
  DATA.rooms.push({id:uid(), name, course, teacherId: teacherId||null});
  saveData(); renderAdmin(); toast('تمت إضافة القاعة');
}
function deleteRoom(id){
  DATA.rooms = DATA.rooms.filter(r=>r.id!==id);
  DATA.students.forEach(s=>{ if(s.roomId===id) s.roomId=null; });
  saveData(); renderAdmin(); toast('تم حذف القاعة');
}

/* ---- Admin: Teachers ---- */
function renderAdminTeachers(){
  const rows = DATA.teachers.map(t=>{
    const roomNames = DATA.rooms.filter(r=>r.teacherId===t.id).map(r=>r.name).join('، ') || '—';
    return '<tr><td><b>'+escapeHtml(t.name)+'</b></td><td>'+(t.phone?escapeHtml(t.phone):'—')+'</td><td>'+escapeHtml(roomNames)+'</td>'+
      '<td><button class="icon-btn" onclick="deleteTeacher(\''+t.id+'\')">حذف ✕</button></td></tr>';
  }).join('');
  return `
  <h2>المعلمون والمعلمات</h2>
  <p class="lead">أضف أسماء المعلمين والمعلمات هنا، ثم عيّنهم لقاعة من تبويب "القاعات والدورات".</p>
  <div class="card">
    <h3>إضافة معلم/ـة</h3>
    <div class="row2">
      <div class="field"><label>اسم المعلم/ـة</label><input id="teacherName" placeholder="الاسم الكامل"></div>
      <div class="field"><label>رقم الجوال (اختياري)</label><input id="teacherPhone" placeholder="05xxxxxxxx"></div>
    </div>
    <button class="btn" onclick="addTeacher()">+ إضافة معلم/ـة</button>
  </div>
  <div class="card">
    <h3>إضافة عدة معلمين ومعلمات دفعة واحدة</h3>
    <div class="field"><label>اكتب اسماً في كل سطر</label><textarea id="teacherBulk" placeholder="محمد أحمد
سارة خالد
..."></textarea></div>
    <button class="btn ghost" onclick="addTeachersBulk()">+ إضافة القائمة</button>
  </div>
  <div class="card">
    <h3>قائمة المعلمين والمعلمات (${DATA.teachers.length})</h3>
    ${DATA.teachers.length? `<table><thead><tr><th>الاسم</th><th>الجوال</th><th>القاعات</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<p class="empty">لا يوجد معلمون أو معلمات بعد.</p>'}
  </div>`;
}
function addTeacher(){
  const name = document.getElementById('teacherName').value.trim();
  const phone = document.getElementById('teacherPhone').value.trim();
  if(!name){ toast('يرجى إدخال اسم المعلم/ـة', true); return; }
  DATA.teachers.push({id:uid(), name, phone});
  saveData(); renderAdmin(); toast('تمت إضافة المعلم/ـة');
}
function addTeachersBulk(){
  const raw = document.getElementById('teacherBulk').value;
  const names = raw.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ toast('لم يتم إدخال أي اسم', true); return; }
  names.forEach(n=> DATA.teachers.push({id:uid(), name:n, phone:''}));
  saveData(); renderAdmin(); toast('تمت إضافة '+names.length+' معلم/ـة');
}
function deleteTeacher(id){
  DATA.teachers = DATA.teachers.filter(t=>t.id!==id);
  DATA.rooms.forEach(r=>{ if(r.teacherId===id) r.teacherId=null; });
  DATA.teacherEvaluations = DATA.teacherEvaluations.filter(e=>e.teacherId!==id);
  DATA.teacherDeductions = DATA.teacherDeductions.filter(d=>d.teacherId!==id);
  saveData(); renderAdmin(); toast('تم حذف المعلم/ـة');
}

/* ---- Admin: تقييم المعلمين والمعلمات (خاص بالإدارة، لا يظهر للمعلم/ـة) ---- */
function renderAdminTeacherEval(){
  if(!DATA.teachers.length){
    return '<h2>تقييم المعلمين والمعلمات</h2><div class="card"><p class="empty">أضف معلمين/معلمات أولاً من تبويب "المعلمون والمعلمات".</p></div>';
  }
  const cards = DATA.teachers.map(t=>{
    const ev = DATA.teacherEvaluations.find(e=>e.teacherId===t.id);
    const scores = (ev && ev.scores) || {};
    const base = ev ? avgTeacherScore(scores) : null;
    const dedList = DATA.teacherDeductions.filter(d=>d.teacherId===t.id).slice().reverse();
    const dedTotal = teacherDeductionTotal(t.id);
    const final = base!==null ? Math.max(0, base-dedTotal) : null;
    const lastRep = lastReportOf(t.id);
    const noReportWarn = !lastRep ? '<span class="tag orange">لم يرفع أي تقرير بعد</span>' : '';
    const open = openTeacherEvalId===t.id;
    const critRows = TEACHER_CRITERIA.map(c=>
      '<div class="crit-row"><span class="crit-label">'+c.label+'</span>'+
      starsHtml(scores[c.key]||0, true, "setTeacherEvalScore('"+t.id+"','"+c.key+"',")+'</div>'
    ).join('');
    const dedRows = dedList.map(d=>
      '<div class="crit-row"><span class="crit-label">'+escapeHtml(d.reason)+' <span class="small-note">('+fmtDate(d.date)+')</span></span>'+
      '<span style="display:flex;align-items:center;gap:8px;"><span class="tag" style="background:#fdeeee;color:#c0392b;">-'+d.points+'</span>'+
      '<button class="icon-btn" onclick="deleteDeduction(\''+d.id+'\')">حذف ✕</button></span></div>'
    ).join('');
    return '<div class="student-card">'+
      '<div class="student-head" onclick="toggleTeacherEval(\''+t.id+'\')">'+
      '<div><div class="student-name">'+escapeHtml(t.name)+'</div><div class="student-meta">'+
        (ev? 'آخر تحديث: '+fmtDate(ev.date) : 'لم يُقيَّم بعد')+' '+noReportWarn+'</div></div>'+
      (final!==null? '<span class="avg-badge">⭐ '+final.toFixed(1)+' / 5</span>' : '<span class="tag">تقييم جديد</span>')+
      '</div>'+
      '<div class="student-body'+(open?' open':'')+'" id="teval-body-'+t.id+'">'+
        critRows+
        '<div class="field" style="margin-top:14px;"><label>ملاحظة (اختياري)</label><textarea id="teval-note-'+t.id+'" placeholder="ملاحظات إضافية عن أداء المعلم/ـة...">'+escapeHtml((ev&&ev.note)||'')+'</textarea></div>'+
        '<button class="btn orange" onclick="saveTeacherEval(\''+t.id+'\')">💾 حفظ التقييم</button>'+
        '<div style="margin-top:22px;padding-top:16px;border-top:1px dashed var(--line);">'+
          '<h3 style="margin:0 0 16px;">الخصومات <span class="tag" style="background:#fdeeee;color:#c0392b;">إجمالي الخصم: -'+dedTotal+'</span></h3>'+
          (dedRows || '<p class="empty" style="padding:10px 0;">لا توجد خصومات مسجلة.</p>')+
          '<button class="btn sm" style="margin-top:12px;background:#fdeeee;color:#c0392b;" onclick="addReportDeduction(\''+t.id+'\')">✕ خصم نقطة (لم يرفع التقرير)</button>'+
          '<div class="row2" style="margin-top:14px;">'+
            '<div class="field"><label>سبب خصم آخر (اختياري)</label><input id="ded-reason-'+t.id+'" placeholder="مثال: تأخر عن المحاضرة"></div>'+
            '<div class="field"><label>عدد النقاط</label><input id="ded-points-'+t.id+'" type="number" step="0.5" min="0.5" placeholder="1"></div>'+
          '</div>'+
          '<button class="btn sm ghost" onclick="addCustomDeduction(\''+t.id+'\')">+ إضافة خصم مخصص</button>'+
        '</div>'+
      '</div></div>';
  }).join('');
  return `
  <h2>تقييم المعلمين والمعلمات</h2>
  <p class="lead">تقييم داخلي خاص بالإدارة فقط، ولا يظهر إطلاقاً للمعلم أو المعلمة. يشمل معايير الأداء التعليمي، مع إمكانية خصم نقاط عند التقصير في رفع التقارير الأسبوعية أو أي مخالفة أخرى.</p>
  ${cards}`;
}
function toggleTeacherEval(id){ openTeacherEvalId = openTeacherEvalId===id ? null : id; renderAdmin(); }
function setTeacherEvalScore(teacherId, critKey, value){
  let ev = DATA.teacherEvaluations.find(e=>e.teacherId===teacherId);
  if(!ev){ ev = {id:uid(), teacherId, scores:{}, note:'', date:new Date().toISOString()}; DATA.teacherEvaluations.push(ev); }
  ev.scores[critKey] = value;
  openTeacherEvalId = teacherId;
  renderAdmin();
}
async function saveTeacherEval(teacherId){
  let ev = DATA.teacherEvaluations.find(e=>e.teacherId===teacherId);
  if(!ev){ ev = {id:uid(), teacherId, scores:{}, note:'', date:new Date().toISOString()}; DATA.teacherEvaluations.push(ev); }
  const noteEl = document.getElementById('teval-note-'+teacherId);
  ev.note = noteEl ? noteEl.value.trim() : '';
  ev.date = new Date().toISOString();
  await saveData();
  toast('تم حفظ تقييم المعلم/ـة');
  openTeacherEvalId = teacherId;
  renderAdmin();
}
function addReportDeduction(teacherId){
  DATA.teacherDeductions.push({id:uid(), teacherId, reason:REPORT_DEDUCTION_REASON, points:1, date:new Date().toISOString()});
  openTeacherEvalId = teacherId;
  saveData(); renderAdmin(); toast('تم خصم نقطة لعدم رفع التقرير');
}
function addCustomDeduction(teacherId){
  const reasonEl = document.getElementById('ded-reason-'+teacherId);
  const pointsEl = document.getElementById('ded-points-'+teacherId);
  const reason = (reasonEl && reasonEl.value.trim()) || 'مخالفة';
  const points = parseFloat(pointsEl && pointsEl.value) || 1;
  if(points<=0){ toast('أدخل عدد نقاط أكبر من صفر', true); return; }
  DATA.teacherDeductions.push({id:uid(), teacherId, reason, points, date:new Date().toISOString()});
  openTeacherEvalId = teacherId;
  saveData(); renderAdmin(); toast('تم إضافة الخصم');
}
function deleteDeduction(id){
  const d = DATA.teacherDeductions.find(x=>x.id===id);
  if(d) openTeacherEvalId = d.teacherId;
  DATA.teacherDeductions = DATA.teacherDeductions.filter(x=>x.id!==id);
  saveData(); renderAdmin(); toast('تم حذف الخصم');
}

/* ---- Admin: Students ---- */
function renderAdminStudents(){
  const roomOptions = DATA.rooms.map(r=>'<option value="'+r.id+'">'+escapeHtml(r.name)+'</option>').join('');
  const groups = DATA.rooms.map(r=>{
    const list = DATA.students.filter(s=>s.roomId===r.id);
    const rows = list.map(s=>'<tr><td>'+escapeHtml(s.name)+'</td><td><button class="icon-btn" onclick="deleteStudent(\''+s.id+'\')">حذف ✕</button></td></tr>').join('');
    return '<div class="card"><h3>'+escapeHtml(r.name)+' <span class="tag">'+list.length+' طالب</span></h3>'+
      (list.length? '<table><tbody>'+rows+'</tbody></table>' : '<p class="empty">لا يوجد طلاب في هذه القاعة بعد.</p>')+'</div>';
  }).join('');
  const unassigned = DATA.students.filter(s=>!s.roomId);
  const unassignedBlock = unassigned.length? '<div class="card"><h3>بدون قاعة <span class="tag orange">'+unassigned.length+'</span></h3><table><tbody>'+
    unassigned.map(s=>'<tr><td>'+escapeHtml(s.name)+'</td><td><button class="icon-btn" onclick="deleteStudent(\''+s.id+'\')">حذف ✕</button></td></tr>').join('')+
    '</tbody></table></div>' : '';
  return `
  <h2>الطلاب</h2>
  <p class="lead">أضف الطلاب وحدد القاعة التابعين لها. ستظهر الأسماء تلقائياً عند المعلم/ـة المسؤول/ـة عن القاعة.</p>
  <div class="card">
    <h3>إضافة طالب</h3>
    <div class="row2">
      <div class="field"><label>اسم الطالب</label><input id="studentName" placeholder="الاسم الكامل"></div>
      <div class="field"><label>القاعة</label><select id="studentRoom"><option value="">— بدون تعيين —</option>${roomOptions}</select></div>
    </div>
    <button class="btn" onclick="addStudent()">+ إضافة طالب</button>
  </div>
  <div class="card">
    <h3>إضافة عدة طلاب دفعة واحدة لقاعة محددة</h3>
    <div class="row2">
      <div class="field"><label>القاعة</label><select id="studentBulkRoom"><option value="">— اختر القاعة —</option>${roomOptions}</select></div>
      <div class="field"><label>اسم في كل سطر</label><textarea id="studentBulk" placeholder="عبدالله سعد
نورة فهد
..."></textarea></div>
    </div>
    <button class="btn ghost" onclick="addStudentsBulk()">+ إضافة القائمة</button>
  </div>
  ${unassignedBlock}
  ${groups || '<p class="empty">أضف قاعة أولاً من تبويب القاعات.</p>'}`;
}
function addStudent(){
  const name = document.getElementById('studentName').value.trim();
  const roomId = document.getElementById('studentRoom').value || null;
  if(!name){ toast('يرجى إدخال اسم الطالب', true); return; }
  DATA.students.push({id:uid(), name, roomId});
  saveData(); renderAdmin(); toast('تمت إضافة الطالب');
}
function addStudentsBulk(){
  const roomId = document.getElementById('studentBulkRoom').value || null;
  const raw = document.getElementById('studentBulk').value;
  const names = raw.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ toast('لم يتم إدخال أي اسم', true); return; }
  names.forEach(n=> DATA.students.push({id:uid(), name:n, roomId}));
  saveData(); renderAdmin(); toast('تمت إضافة '+names.length+' طالب');
}
function deleteStudent(id){
  DATA.students = DATA.students.filter(s=>s.id!==id);
  DATA.evaluations = DATA.evaluations.filter(e=>e.studentId!==id);
  saveData(); renderAdmin(); toast('تم حذف الطالب');
}

/* ---- Admin: Evaluations (read-only overview) ---- */
function renderAdminEvals(){
  const roomOptions = DATA.rooms.map(r=>'<option value="'+r.id+'">'+escapeHtml(r.name)+'</option>').join('');
  const filterId = window.__evalFilter || '';
  const evs = DATA.evaluations.filter(e=> !filterId || e.roomId===filterId);
  const rows = evs.map(e=>{
    const s = DATA.students.find(x=>x.id===e.studentId);
    const t = DATA.teachers.find(x=>x.id===e.teacherId);
    const r = DATA.rooms.find(x=>x.id===e.roomId);
    const avg = avgScore(e.scores).toFixed(1);
    return '<tr><td><b>'+escapeHtml(s?s.name:'—')+'</b></td><td>'+escapeHtml(r?r.name:'—')+'</td>'+
      '<td>'+escapeHtml(t?t.name:'—')+'</td><td>'+starsHtml(Math.round(avg),false)+' <span class="tag orange">'+avg+' / 5</span></td>'+
      '<td class="small-note">'+fmtDate(e.date)+'</td></tr>';
  }).join('');
  return `
  <h2>التقييمات</h2>
  <p class="lead">استعراض شامل لتقييمات جميع المعلمين والمعلمات لطلابهم.</p>
  <div class="card">
    <div class="field" style="max-width:260px;"><label>تصفية حسب القاعة</label>
      <select onchange="window.__evalFilter=this.value; renderAdmin();"><option value="">كل القاعات</option>${roomOptions.replace(new RegExp('value="'+filterId+'"'), 'value="'+filterId+'" selected')}</select>
    </div>
    ${evs.length? `<table><thead><tr><th>الطالب</th><th>القاعة</th><th>المعلم/ـة</th><th>المعدل</th><th>آخر تحديث</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">لا توجد تقييمات مسجلة بعد.</p>'}
  </div>`;
}

/* ---- Admin: Reports ---- */
function renderAdminReports(){
  const rows = DATA.reports.slice().reverse().map(rep=>{
    const t = DATA.teachers.find(x=>x.id===rep.teacherId);
    const r = DATA.rooms.find(x=>x.id===rep.roomId);
    const imagesHtml = (rep.images && rep.images.length)
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px;">'+rep.images.map(img=>
          '<img src="'+img+'" style="width:96px;height:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:pointer;" onclick="window.open(this.src)">'
        ).join('')+'</div>' : '';
    return '<div class="card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;">'+
      '<h3 style="margin:0;">'+escapeHtml(rep.week||'تقرير أسبوعي')+' — <span class="tag">'+escapeHtml(t?t.name:'—')+'</span> <span class="tag orange">'+escapeHtml(r?r.name:'—')+'</span></h3>'+
      '<button class="icon-btn" onclick="deleteReport(\''+rep.id+'\')">حذف ✕</button></div>'+
      '<p style="font-size:13.5px;line-height:1.9;margin:12px 0;">'+escapeHtml(rep.content||'—')+'</p>'+
      imagesHtml+
      (rep.driveLink? '<a class="btn sm ghost" href="'+escapeHtml(rep.driveLink)+'" target="_blank">📁 فتح ملف Google Drive</a>':'')+
      '<p class="small-note">'+fmtDate(rep.date)+'</p></div>';
  }).join('');
  return `
  <h2>التقارير الأسبوعية</h2>
  <p class="lead">تقارير يرفعها المعلمون والمعلمات أسبوعياً، مع إمكانية إرفاق رابط Google Drive أو صور.</p>
  ${DATA.reports.length? rows : '<div class="card"><p class="empty">لا توجد تقارير مرفوعة بعد.</p></div>'}`;
}
function deleteReport(id){
  DATA.reports = DATA.reports.filter(r=>r.id!==id);
  saveData(); renderAdmin(); toast('تم حذف التقرير');
}

/* ---- Admin: Announcements ---- */
function renderAdminAnnounce(){
  const rows = DATA.announcements.slice().reverse().map(a=>
    '<div class="announce-item"><div class="d">'+fmtDate(a.date)+' <button class="icon-btn" style="float:left;" onclick="deleteAnnounce(\''+a.id+'\')">حذف ✕</button></div>'+escapeHtml(a.text)+'</div>'
  ).join('');
  return `
  <h2>التعميمات</h2>
  <p class="lead">أرسل رسالة تصل فوراً لجميع المعلمين والمعلمات عند دخولهم للمنصة.</p>
  <div class="card">
    <h3>تعميم جديد</h3>
    <div class="field"><textarea id="announceText" placeholder="اكتب نص التعميم هنا..."></textarea></div>
    <button class="btn orange" onclick="sendAnnounce()">📢 إرسال للجميع</button>
  </div>
  <div class="card"><h3>التعميمات السابقة</h3>${DATA.announcements.length? rows : '<p class="empty">لا توجد تعميمات بعد.</p>'}</div>`;
}
function sendAnnounce(){
  const text = document.getElementById('announceText').value.trim();
  if(!text){ toast('يرجى كتابة نص التعميم', true); return; }
  DATA.announcements.push({id:uid(), text, date:new Date().toISOString()});
  saveData(); renderAdmin(); toast('تم إرسال التعميم لجميع المعلمين والمعلمات');
}
function deleteAnnounce(id){
  DATA.announcements = DATA.announcements.filter(a=>a.id!==id);
  saveData(); renderAdmin(); toast('تم حذف التعميم');
}

/* ---- Admin: Champion ---- */
function renderAdminChampion(){
  const blocks = DATA.rooms.map(r=>{
    const students = DATA.students.filter(s=>s.roomId===r.id).map(s=>({s, avg: studentAverage(s.id)||0}));
    students.sort((a,b)=>b.avg-a.avg);
    const champId = DATA.champions[r.id];
    const items = students.slice(0,5).map((row,idx)=>{
      const medalClass = idx===0?'gold':idx===1?'silver':idx===2?'bronze':'n';
      const isChamp = champId===row.s.id;
      return '<div class="rank-item"><div class="medal '+medalClass+'">'+(idx+1)+'</div>'+
        '<div style="flex:1;"><b>'+escapeHtml(row.s.name)+'</b>'+(isChamp?' <span class="champ-star">🏆 بطل الدورة</span>':'')+
        '<div class="small-note">المعدل: '+row.avg.toFixed(1)+' / 5</div></div>'+
        '<button class="btn sm '+(isChamp?'ghost':'orange')+'" onclick="toggleChampion(\''+r.id+'\',\''+row.s.id+'\')">'+(isChamp?'إلغاء التكريم':'تكريم كأفضل طالب')+'</button></div>';
    }).join('');
    return '<div class="card"><h3>'+escapeHtml(r.name)+' <span class="tag">'+escapeHtml(r.course||'')+'</span></h3>'+
      (students.length? items : '<p class="empty">لا يوجد طلاب مقيَّمون في هذه القاعة بعد.</p>')+'</div>';
  }).join('');
  return `
  <h2>أفضل طالب</h2>
  <p class="lead">ترتيب تلقائي حسب معدل تقييم المعلم/ـة لكل معيار. يمكنك تكريم طالب رسمياً كبطل للقاعة عند نهاية الدورة.</p>
  ${DATA.rooms.length? blocks : '<div class="card"><p class="empty">أضف قاعات وطلاباً أولاً.</p></div>'}`;
}
function toggleChampion(roomId, studentId){
  if(DATA.champions[roomId]===studentId){ delete DATA.champions[roomId]; }
  else{ DATA.champions[roomId] = studentId; }
  saveData(); renderAdmin(); toast('تم تحديث تكريم البطل');
}

/* ---- Admin: Export ---- */
function renderAdminExport(){
  return `
  <h2>تصدير البيانات إلى Excel</h2>
  <p class="lead">البيانات محفوظة تلقائياً على المنصة لحظة إدخالها. يمكنك أيضاً تنزيل نسخة Excel وقتما تشاء.</p>
  <div class="stat-grid">
    <div class="stat-box"><b>${DATA.students.length}</b><span>طالب مسجّل</span></div>
    <div class="stat-box orange"><b>${DATA.evaluations.length}</b><span>تقييم مكتمل</span></div>
    <div class="stat-box"><b>${DATA.reports.length}</b><span>تقرير أسبوعي</span></div>
  </div>
  <div class="card">
    <h3>تنزيل يدوي</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn" onclick="exportExcel()">⬇️ تنزيل ملف Excel شامل (كل الأوراق)</button>
    </div>
    <p class="small-note">يحتوي الملف على 4 أوراق: الطلاب، التقييمات، التقارير، التعميمات.</p>
  </div>
  <div class="card">
    <h3>التصدير التلقائي</h3>
    <label class="checkbox-row"><input type="checkbox" id="autoExportChk" ${DATA.autoExport?'checked':''} onchange="toggleAutoExport(this.checked)"> تنزيل ملف Excel تلقائياً على جهاز المعلم/ـة بعد كل عملية تقييم جديدة</label>
    <p class="small-note">ملاحظة: التصدير التلقائي يعمل محلياً على متصفح الجهاز الذي تمّ منه إدخال التقييم فقط.</p>
  </div>`;
}
function toggleAutoExport(val){
  DATA.autoExport = val;
  saveData();
  toast(val? 'تم تفعيل التصدير التلقائي' : 'تم إيقاف التصدير التلقائي');
}
function exportExcel(){
  if(typeof XLSX === 'undefined'){ toast('تعذّر تحميل مكتبة Excel، تحقق من الاتصال', true); return; }
  const wb = XLSX.utils.book_new();

  const studentsRows = DATA.students.map(s=>{
    const r = DATA.rooms.find(x=>x.id===s.roomId);
    const avg = studentAverage(s.id);
    return {'اسم الطالب': s.name, 'القاعة': r?r.name:'—', 'الدورة': r?r.course:'—', 'المعدل': avg? avg.toFixed(2):'—'};
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsRows), 'الطلاب');

  const evalRows = DATA.evaluations.map(e=>{
    const s = DATA.students.find(x=>x.id===e.studentId);
    const t = DATA.teachers.find(x=>x.id===e.teacherId);
    const r = DATA.rooms.find(x=>x.id===e.roomId);
    const row = {'الطالب': s?s.name:'—', 'القاعة': r?r.name:'—', 'المعلم/ـة': t?t.name:'—'};
    CRITERIA.forEach(c=> row[c.label] = (e.scores && e.scores[c.key]) || 0);
    row['المعدل'] = avgScore(e.scores).toFixed(2);
    row['ملاحظة'] = e.note||'';
    row['التاريخ'] = fmtDate(e.date);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evalRows), 'التقييمات');

  const reportRows = DATA.reports.map(rep=>{
    const t = DATA.teachers.find(x=>x.id===rep.teacherId);
    const r = DATA.rooms.find(x=>x.id===rep.roomId);
    return {'الأسبوع': rep.week||'—', 'المعلم/ـة': t?t.name:'—', 'القاعة': r?r.name:'—', 'المحتوى': rep.content||'', 'رابط Drive': rep.driveLink||'', 'عدد الصور المرفقة': (rep.images&&rep.images.length)||0, 'التاريخ': fmtDate(rep.date)};
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportRows), 'التقارير');

  const annRows = DATA.announcements.map(a=>({'النص': a.text, 'التاريخ': fmtDate(a.date)}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(annRows), 'التعميمات');

  XLSX.writeFile(wb, 'منصة_السقيفة_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('تم تنزيل ملف Excel');
}

/* ---- Admin: Settings ---- */
function renderAdminSettings(){
  return `
  <h2>الإعدادات</h2>
  <div class="card">
    <h3>تغيير كلمة مرور الإدارة</h3>
    <div class="row2">
      <div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="newPw1" placeholder="••••••••"></div>
      <div class="field"><label>تأكيد كلمة المرور</label><input type="password" id="newPw2" placeholder="••••••••"></div>
    </div>
    <button class="btn" onclick="changeAdminPw()">حفظ كلمة المرور</button>
  </div>`;
}
async function changeAdminPw(){
  const p1 = document.getElementById('newPw1').value;
  const p2 = document.getElementById('newPw2').value;
  if(!p1 || p1.length<4){ toast('كلمة المرور قصيرة جداً', true); return; }
  if(p1!==p2){ toast('كلمتا المرور غير متطابقتين', true); return; }
  await setAdminPw(p1);
  toast('تم تحديث كلمة المرور');
}

/* ============ TEACHER SIDE ============ */
const TEACHER_TABS = [
  {id:'evaluate', label:'تقييم الطلاب', ic:'📊'},
  {id:'reports', label:'تقاريري الأسبوعية', ic:'📄'},
  {id:'announce', label:'التعميمات', ic:'📢'},
  {id:'settings', label:'الإعدادات', ic:'⚙️'}
];

function renderTeacher(){
  renderHeaderActions();
  const nav = document.getElementById('teacherNav');
  nav.innerHTML = TEACHER_TABS.map(t=>{
    let badge = '';
    if(t.id==='announce'){
      const t0 = DATA.teachers.find(x=>x.id===currentTeacherId);
      const lastSeen = t0 && t0.lastSeenAnnounce ? t0.lastSeenAnnounce : null;
      const unread = DATA.announcements.filter(a=> !lastSeen || a.date>lastSeen).length;
      if(unread>0) badge = ' <span class="tag orange">'+unread+'</span>';
    }
    return '<button class="side-btn'+(teacherTab===t.id?' active':'')+'" onclick="setTeacherTab(\''+t.id+'\')"><span class="ic">'+t.ic+'</span>'+t.label+badge+'</button>';
  }).join('');
  const main = document.getElementById('teacherMain');
  main.innerHTML = TEACHER_RENDERERS[teacherTab]();
}
function setTeacherTab(id){
  teacherTab=id;
  if(id==='announce'){
    const t = DATA.teachers.find(x=>x.id===currentTeacherId);
    if(t){ t.lastSeenAnnounce = new Date().toISOString(); saveData(); }
  }
  renderTeacher();
}

const TEACHER_RENDERERS = {
  evaluate: renderTeacherEvaluate,
  reports: renderTeacherReports,
  announce: renderTeacherAnnounce,
  settings: renderTeacherSettings
};

function myRooms(){ return DATA.rooms.filter(r=>r.teacherId===currentTeacherId); }

function renderTeacherEvaluate(){
  const rooms = myRooms();
  if(!rooms.length){
    return '<h2>تقييم الطلاب</h2><div class="card"><p class="empty">لم تُعيَّن لأي قاعة بعد. يرجى مراجعة الإدارة.</p></div>';
  }
  if(!selectedTeacherRoomId || !rooms.find(r=>r.id===selectedTeacherRoomId)) selectedTeacherRoomId = rooms[0].id;
  const roomTabs = rooms.map(r=>'<button class="'+(selectedTeacherRoomId===r.id?'active':'')+'" onclick="selectTeacherRoom(\''+r.id+'\')">'+escapeHtml(r.name)+'</button>').join('');
  const students = DATA.students.filter(s=>s.roomId===selectedTeacherRoomId);
  const cards = students.map(s=>{
    const ev = DATA.evaluations.find(e=>e.studentId===s.id && e.teacherId===currentTeacherId);
    const scores = (ev && ev.scores) || {};
    const avg = ev ? avgScore(scores) : null;
    const open = openStudentId===s.id;
    const critRows = CRITERIA.map(c=>
      '<div class="crit-row"><span class="crit-label">'+c.label+'</span>'+
      starsHtml(scores[c.key]||0, true, "setScore('"+s.id+"','"+c.key+"',")+'</div>'
    ).join('');
    return '<div class="student-card">'+
      '<div class="student-head" onclick="toggleStudent(\''+s.id+'\')">'+
      '<div><div class="student-name">'+escapeHtml(s.name)+'</div><div class="student-meta">'+(ev? 'آخر تحديث: '+fmtDate(ev.date) : 'لم يُقيَّم بعد')+'</div></div>'+
      (avg!==null? '<span class="avg-badge">⭐ '+avg.toFixed(1)+' / 5</span>' : '<span class="tag">تقييم جديد</span>')+
      '</div>'+
      '<div class="student-body'+(open?' open':'')+'" id="body-'+s.id+'">'+
        critRows+
        '<div class="field" style="margin-top:14px;"><label>ملاحظة (اختياري)</label><textarea id="note-'+s.id+'" placeholder="ملاحظات إضافية عن الطالب...">'+escapeHtml((ev&&ev.note)||'')+'</textarea></div>'+
        '<button class="btn orange" onclick="saveEvaluation(\''+s.id+'\')">💾 حفظ التقييم</button>'+
      '</div></div>';
  }).join('');
  return `
  <h2>تقييم الطلاب</h2>
  <p class="lead">اختر القاعة، ثم اضغط على اسم الطالب لعرض معايير التقييم.</p>
  <div class="tabbar">${roomTabs}</div>
  ${students.length? cards : '<div class="card"><p class="empty">لا يوجد طلاب في هذه القاعة بعد.</p></div>'}`;
}
function selectTeacherRoom(id){ selectedTeacherRoomId=id; openStudentId=null; renderTeacher(); }
function toggleStudent(id){ openStudentId = openStudentId===id ? null : id; renderTeacher(); }

function setScore(studentId, critKey, value){
  let ev = DATA.evaluations.find(e=>e.studentId===studentId && e.teacherId===currentTeacherId);
  if(!ev){
    ev = {id:uid(), studentId, teacherId:currentTeacherId, roomId:selectedTeacherRoomId, scores:{}, note:'', date:new Date().toISOString()};
    DATA.evaluations.push(ev);
  }
  ev.scores[critKey] = value;
  renderTeacher();
  // re-open the same student's card after re-render
  openStudentId = studentId;
  const body = document.getElementById('body-'+studentId);
  if(body) body.classList.add('open');
}
async function saveEvaluation(studentId){
  let ev = DATA.evaluations.find(e=>e.studentId===studentId && e.teacherId===currentTeacherId);
  if(!ev){
    ev = {id:uid(), studentId, teacherId:currentTeacherId, roomId:selectedTeacherRoomId, scores:{}, note:'', date:new Date().toISOString()};
    DATA.evaluations.push(ev);
  }
  const noteEl = document.getElementById('note-'+studentId);
  ev.note = noteEl ? noteEl.value.trim() : '';
  ev.date = new Date().toISOString();
  ev.roomId = selectedTeacherRoomId;
  await saveData();
  toast('تم حفظ التقييم بنجاح');
  if(DATA.autoExport){ exportExcel(); }
  renderTeacher();
}

function renderTeacherReports(){
  const rooms = myRooms();
  const roomOptions = rooms.map(r=>'<option value="'+r.id+'">'+escapeHtml(r.name)+'</option>').join('');
  const mine = DATA.reports.filter(r=>r.teacherId===currentTeacherId).slice().reverse();
  const list = mine.map(rep=>{
    const r = DATA.rooms.find(x=>x.id===rep.roomId);
    const imagesHtml = (rep.images && rep.images.length)
      ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px;">'+rep.images.map(img=>
          '<img src="'+img+'" style="width:84px;height:84px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:pointer;" onclick="window.open(this.src)">'
        ).join('')+'</div>' : '';
    return '<div class="card"><h3 style="margin:0 0 8px;">'+escapeHtml(rep.week||'تقرير')+' — <span class="tag">'+escapeHtml(r?r.name:'—')+'</span></h3>'+
      '<p style="font-size:13.5px;line-height:1.9;margin:0 0 8px;">'+escapeHtml(rep.content)+'</p>'+
      imagesHtml+
      (rep.driveLink? '<a class="btn sm ghost" href="'+escapeHtml(rep.driveLink)+'" target="_blank">📁 رابط Drive</a>' : '')+
      '<p class="small-note">'+fmtDate(rep.date)+'</p></div>';
  }).join('');
  return `
  <h2>تقاريري الأسبوعية</h2>
  <p class="lead">ترفع التقارير مباشرة إلى الإدارة، مع إمكانية إرفاق رابط Google Drive أو صور مباشرة من كاميرا الجوال أو المعرض.</p>
  <div class="card">
    <h3>رفع تقرير جديد</h3>
    <div class="row2">
      <div class="field"><label>القاعة</label><select id="repRoom">${roomOptions}</select></div>
      <div class="field"><label>الأسبوع</label><input id="repWeek" placeholder="مثال: الأسبوع الثاني"></div>
    </div>
    <div class="field"><label>محتوى التقرير</label><textarea id="repContent" placeholder="اكتب ملخص الأسبوع..."></textarea></div>
    <div class="field"><label>رابط Google Drive (اختياري)</label><input id="repDrive" placeholder="https://drive.google.com/..."></div>
    <div class="field">
      <label>أو أرفق صوراً (تصوير مباشر من الجوال أو اختيار من المعرض — حتى ${MAX_REPORT_IMAGES} صور)</label>
      <input type="file" id="repImages" accept="image/*" multiple>
    </div>
    <button class="btn orange" onclick="submitReport()">📤 إرسال التقرير للإدارة</button>
  </div>
  <h3 style="color:var(--purple);">تقاريري السابقة</h3>
  ${mine.length? list : '<div class="card"><p class="empty">لم ترفع أي تقرير بعد.</p></div>'}`;
}
function readAndCompressImage(file, maxDim, quality){
  maxDim = maxDim || 1000; quality = quality || 0.7;
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = function(e){
      const img = new Image();
      img.onload = function(){
        let w = img.width, h = img.height;
        if(w>h){ if(w>maxDim){ h = Math.round(h*maxDim/w); w = maxDim; } }
        else{ if(h>maxDim){ w = Math.round(w*maxDim/h); h = maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function submitReport(){
  const roomId = document.getElementById('repRoom').value;
  const week = document.getElementById('repWeek').value.trim();
  const content = document.getElementById('repContent').value.trim();
  const driveLink = document.getElementById('repDrive').value.trim();
  const filesInput = document.getElementById('repImages');
  if(!roomId){ toast('لا توجد قاعة لإرسال التقرير لها', true); return; }
  if(!content){ toast('يرجى كتابة محتوى التقرير', true); return; }
  let images = [];
  if(filesInput && filesInput.files && filesInput.files.length){
    toast('جاري رفع الصور...');
    try{
      const files = Array.from(filesInput.files).slice(0, MAX_REPORT_IMAGES);
      images = await Promise.all(files.map(f=>readAndCompressImage(f)));
    }catch(e){
      toast('تعذّر معالجة إحدى الصور، تم إرسال التقرير بدونها', true);
    }
  }
  DATA.reports.push({id:uid(), teacherId:currentTeacherId, roomId, week, content, driveLink, images, date:new Date().toISOString()});
  await saveData(); renderTeacher(); toast('تم إرسال التقرير للإدارة');
}

function renderTeacherAnnounce(){
  const list = DATA.announcements.slice().reverse().map(a=>
    '<div class="announce-item"><div class="d">'+fmtDate(a.date)+'</div>'+escapeHtml(a.text)+'</div>'
  ).join('');
  return `
  <h2>التعميمات</h2>
  <p class="lead">آخر الرسائل الموجهة من الإدارة لجميع المعلمين والمعلمات.</p>
  ${DATA.announcements.length? list : '<div class="card"><p class="empty">لا توجد تعميمات حالياً.</p></div>'}`;
}

function renderTeacherSettings(){
  const t = DATA.teachers.find(x=>x.id===currentTeacherId);
  return `
  <h2>الإعدادات</h2>
  <div class="card">
    <h3>رقم الجوال للتنبيهات (اختياري)</h3>
    <div class="field"><label>رقم الجوال</label><input id="myPhone" value="${escapeHtml(t&&t.phone||'')}" placeholder="05xxxxxxxx"></div>
    <button class="btn" onclick="saveMyPhone()">حفظ</button>
    <p class="small-note">يُستخدم هذا الرقم لاحقاً لتنبيهك عند وجود تعميم جديد من الإدارة.</p>
  </div>`;
}
function saveMyPhone(){
  const t = DATA.teachers.find(x=>x.id===currentTeacherId);
  if(!t) return;
  t.phone = document.getElementById('myPhone').value.trim();
  saveData(); toast('تم حفظ رقم الجوال');
}

/* ============ BOOT ============ */
async function boot(){
  await loadData();
  populateTeacherSelect();
  showScreen('screen-role');
}
boot();
