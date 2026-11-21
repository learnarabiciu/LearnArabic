/* =========================================================
   منصة تعلم العربية — السقيفة
   Supabase Edition
   ========================================================= */

const CRITERIA = [
  {key:'participation', label:'المشاركة والتفاعل'},
  {key:'behavior', label:'حسن السلوك'},
  {key:'attendance', label:'الانتظام في الحضور'},
  {key:'homework', label:'أداء الواجبات'},
  {key:'cooperation', label:'التعاون مع الزملاء'},
  {key:'commitment', label:'الالتزام بالوقت'}
];

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
const AUTO_EXPORT_KEY = 'saqifah:autoExport';

/* =========================================================
   ربط تقييم المعلمين بـ Google Drive
   -----------------------------------------------------------
   DRIVE_SYNC_WEBAPP_URL: رابط تطبيق الويب الخاص بـGoogle Apps
   Script (بعد نشره). راجع ملف AppsScript_Code.gs وخطوات
   الإعداد المرفقة.
   DRIVE_SYNC_SHARED_SECRET: كلمة سرية بسيطة تُرسل مع كل طلب
   للتأكد أن الطلب قادم من لوحة الإدارة. هذا ليس تشفيرًا
   حقيقيًا (لأنه في كود واجهة عامة) — فقط حماية بسيطة من
   الاستخدام العشوائي. لا تستخدمه كبديل عن مفتاح Supabase
   الحساس (ذاك يبقى داخل Apps Script فقط ولا يوضع هنا).
   ========================================================= */
const DRIVE_SYNC_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxJZNXgBMatL6etcZiM_2tfkq3AlAmmmcVGlSuX058UmncpGPOb6A02TjBY-N3gFxEI/exec';
const DRIVE_SYNC_SHARED_SECRET = 'LearnArabic_8432';

let DATA = emptyData();
let currentUser = null;
let currentProfile = null;
let currentAdmin = false;
let currentTeacherId = null;
let currentEmployeeId = null;
let employeeTab = 'tasks';
let adminStaffStatus = 'all';
let adminStaffEmployee = 'all';
let employeeFilter = 'all';
let employeeStatusFilter = 'all';
let staffDraft = [];
let editingTaskId = null;
let showNewTask = false;
let staffDraftDue = '';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
let selectedTeacherRoomId = null;
let selectedTeacherWeek = 1;
let adminTeacherEvalWeek = 1;
let adminTab = 'rooms';
let teacherTab = 'reports';

function emptyData(){
  return {
    teachers:[],
    students:[],
    rooms:[],
    evaluations:[],
    reports:[],
    announcements:[],
    champions:{},
    autoExport:false,
    teacherEvaluations:[],
    teacherDeductions:[],
    employees:[],
    tasks:[],
    groups:[],
    teacherScores:[],
    evalSettings:evEmptySettings(),
    ceoReports:[],
    taskTemplates:[]
  };
}

function $(id){
  return document.getElementById(id);
}

function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[c]));
}

function uid(){
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function today(){
  return new Date().toISOString();
}

function toast(msg,error=false){
  const wrap=$('toastWrap');

  if(!wrap){
    alert(msg);
    return;
  }

  const el=document.createElement('div');
  el.className=`toast ${error?'error':''}`;
  el.textContent=msg;

  wrap.appendChild(el);

  setTimeout(()=>{
    el.remove();
  },3000);
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(x=>{
    x.classList.remove('active');
  });

  $(id)?.classList.add('active');
}

function getRoom(id){
  return DATA.rooms.find(x=>x.id===id);
}

function getTeacher(id){
  return DATA.teachers.find(x=>x.id===id);
}

function getStudent(id){
  return DATA.students.find(x=>x.id===id);
}

function getEmployee(id){
  return DATA.employees.find(x=>x.id===id);
}

const TASK_STATUSES = [
  {key:'todo',  label:'لم تتم'},
  {key:'doing', label:'قيد العمل'},
  {key:'done',  label:'تمت'}
];

function taskStatusLabel(k){
  return TASK_STATUSES.find(x=>x.key===k)?.label||'لم تتم';
}

function mapEmployee(r){
  return {
    id:r.id,
    name:r.name,
    phone:r.phone||'',
    jobTitle:r.job_title||'',
    loginCode:r.login_code||'',
    isCeo:!!r.is_ceo
  };
}

function mapGroup(r){
  return {
    id:r.id,
    name:r.name,
    description:r.description||'',
    createdAt:r.created_at||''
  };
}

function mapTask(r){
  return {
    id:r.id,
    groupId:r.group_id||null,
    employeeIds:Array.isArray(r.employee_ids)
      ? r.employee_ids
      : (r.employee_id?[r.employee_id]:[]),
    title:r.title||'',
    description:r.description||'',
    status:r.status||'todo',
    dueDate:r.due_date||'',
    employeeNote:r.employee_note||'',
    updatedBy:r.updated_by||'',
    createdAt:r.created_at||'',
    updatedAt:r.updated_at||''
  };
}

/* ملاحظة المدير: تُخزَّن داخل حقل الوصف بعد فاصل مميز */
const ADMIN_NOTE_SEP='\n\u27E6 \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0645\u062F\u064A\u0631 \u27E7\n';
function splitTaskDesc(t){
  const d=t?.description||'';
  const i=d.indexOf(ADMIN_NOTE_SEP);
  if(i<0) return {desc:d,adminNote:''};
  return {
    desc:d.slice(0,i).trim(),
    adminNote:d.slice(i+ADMIN_NOTE_SEP.length).trim()
  };
}
function joinTaskDesc(desc,adminNote){
  desc=(desc||'').trim();
  adminNote=(adminNote||'').trim();
  return adminNote?desc+ADMIN_NOTE_SEP+adminNote:desc;
}

/* مرحلة المهمة من بادئة العنوان */
const TASK_PHASES=['قبل الدورة','أثناء الدورة','بعد الدورة'];
function taskPhase(t){
  const m=/^([123\u0661-\u0663])\s*[\u00B7.]\s*([^\u2014\-]+)/.exec(t?.title||'');
  if(!m) return '';
  return m[2].trim();
}

function taskDisplayTitle(t){
  return String(t?.title||'')
    .replace(/^([123١-٣])\s*[·.]\s*[^—\-]+[—\-]\s*/,'');
}

function teacherRooms(){
  return DATA.rooms.filter(r=>r.teacherId===currentTeacherId);
}

function myStudents(){
  return DATA.students.filter(s=>
    teacherRooms().some(r=>r.id===s.roomId)
  );
}

function fmtDate(d){
  if(!d) return '-';

  try{
    return new Date(d).toLocaleDateString('ar-SA',{
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    });
  }catch{
    return d;
  }
}

function scoreClass(n){
  n=Number(n||0);

  if(n>=90) return 'good';
  if(n>=70) return 'mid';

  return 'low';
}

function avgScores(obj,criteria,maxScale=5){
  if(!criteria.length) return 0;

  const total=criteria.reduce((a,c)=>{
    return a+Number(obj?.[c.key]||0);
  },0);

  return Math.round(
    (total/(criteria.length*maxScale))*100
  );
}

const ICONS={
  edit:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  back:'<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/>',
  trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.22C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.22C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  printer:'<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  refresh:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z"/>',
  hand:'<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  medal:'<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  chart:'<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  pin:'<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v3.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  mobile:'<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
};
ICONS.starFill=ICONS.star;

function icon(name,size){
  const p=ICONS[name]||'';
  const s=size||16;
  const fill=(name==='starFill')?'currentColor':'none';
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

function stars(v){
  const n=Math.max(0,Math.min(5,Number(v||0)));

  return icon('starFill',13).repeat(n)+icon('star',13).repeat(5-n);
}

function normalizeScores(row,criteria){
  const o={};

  criteria.forEach(c=>{
    o[c.key]=Number(row?.[c.key]||0);
  });

  return o;
}

/* =========================================================
   SUPABASE
   ========================================================= */

function db(){
  if(typeof supabaseClient==='undefined'){
    throw new Error(
      'Supabase غير مهيأ. تأكد من إضافة كود Supabase في index.html.'
    );
  }

  return supabaseClient;
}

async function sb(promise){
  const {data,error}=await promise;

  if(error) throw error;

  return data;
}

function friendlyError(e){
  const m=e?.message||'حدث خطأ غير متوقع';

  if(/duplicate|unique/i.test(m)){
    return 'هذا السجل موجود مسبقًا.';
  }

  if(/permission|policy|row-level/i.test(m)){
    return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
  }

  if(/invalid login|invalid credentials/i.test(m)){
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  return m;
}

/* =========================================================
   تحويل بيانات قاعدة البيانات إلى شكل الواجهة
   ========================================================= */

function mapTeacher(r){
  return {
    id:r.id,
    name:r.name,
    phone:r.phone||'',
    userId:r.user_id||'',
    loginCode:r.login_code||'',
    gender:r.gender||'',
    lastSeenAnnounce:r.last_seen_announce||null,
    driveFolderId:r.drive_folder_id||'',
    driveFolderUrl:r.drive_folder_url||''
  };
}

function genTeacherCode(){

  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code='';

  for(let i=0;i<5;i++){
    code+=chars[Math.floor(Math.random()*chars.length)];
  }

  return code;
}

function mapRoom(r){
  return {
    id:r.id,
    name:r.name,
    course:r.course||'',
    teacherId:r.teacher_id||null,
    groupName:r.group_name||'',
    durationDays:
      r.duration_days ||
      (r.duration_weeks?r.duration_weeks*7:null),
    durationWeeks:
      r.duration_weeks ||
      (r.duration_days?Math.ceil(r.duration_days/7):null)
  };
}

function mapStudent(r){
  return {
    id:r.id,
    name:r.name,
    roomId:r.room_id||null,
    phone:r.phone||''
  };
}

function mapEval(r){
  const scores=normalizeScores(r,CRITERIA);

  return {
    id:r.id,
    studentId:r.student_id,
    teacherId:r.teacher_id,
    roomId:r.room_id,
    week:Number(r.week||1),
    scores,
    note:r.note||'',
    date:r.created_at||r.date
  };
}

function mapTeacherEval(r){
  const scores=normalizeScores(r,TEACHER_CRITERIA);

  return {
    id:r.id,
    teacherId:r.teacher_id,
    week:Number(r.week||1),
    scores,
    note:r.note||'',
    date:r.created_at||r.date,
    autoGenerated:!!r.auto_generated,
    aiNotes:r.ai_notes||{},
    evidenceLinks:r.evidence_links||{}
  };
}

function mapDeduction(r){
  return {
    id:r.id,
    teacherId:r.teacher_id,
    reason:r.reason||'',
    points:Number(r.amount||0),
    date:r.created_at
  };
}

function mapReport(r){
  return {
    id:r.id,
    teacherId:r.teacher_id,
    roomId:r.room_id,
    week:r.week||'',
    content:r.content||'',
    driveLink:r.drive_link||'',
    images:Array.isArray(r.images)?r.images:[],
    sentToCeo:!!r.sent_to_ceo,
    date:r.created_at
  };
}

function mapAnnouncement(r){
  return {
    id:r.id,
    text:r.message||'',
    date:r.created_at,
    createdBy:r.created_by
  };
}

/* =========================================================
   تحميل البيانات
   ========================================================= */

async function loadData(){
  DATA=emptyData();

  const [
    teachers,
    rooms,
    students,
    evaluations,
    reports,
    announcements,
    tevals,
    deductions
  ]=await Promise.all([

    sb(
      db()
      .from('teachers')
      .select(
        currentAdmin||currentProfile?.role==='admin'
          ?'*'
          :'id,name,phone,user_id,gender,last_seen_announce,drive_folder_id,drive_folder_url,created_at'
      )
      .order('created_at',{ascending:true})
    ),

    sb(
      db()
      .from('rooms')
      .select('*')
      .order('created_at',{ascending:true})
    ),

    sb(
      db()
      .from('students')
      .select('*')
      .order('created_at',{ascending:true})
    ),

    sb(
      db()
      .from('evaluations')
      .select('*')
      .order('created_at',{ascending:false})
    ),

    sb(
      db()
      .from('reports')
      .select('*')
      .order('created_at',{ascending:false})
    ),

    sb(
      db()
      .from('announcements')
      .select('*')
      .order('created_at',{ascending:false})
    ),

    sb(
      db()
      .from('teacher_evaluations')
      .select('*')
    ),

    sb(
      db()
      .from('teacher_deductions')
      .select('*')
      .order('created_at',{ascending:false})
    )
  ]);

  DATA.teachers=(teachers||[]).map(mapTeacher);
  DATA.rooms=(rooms||[]).map(mapRoom);
  DATA.students=(students||[]).map(mapStudent);
  sortStudents();
  DATA.evaluations=(evaluations||[]).map(mapEval);
  DATA.reports=(reports||[]).map(mapReport);
  DATA.announcements=(announcements||[]).map(mapAnnouncement);
  DATA.teacherEvaluations=(tevals||[]).map(mapTeacherEval);
  DATA.teacherDeductions=(deductions||[]).map(mapDeduction);

  const champions=await sb(
    db()
    .from('champions')
    .select('*')
  );

  DATA.champions={};

  (champions||[]).forEach(x=>{
    DATA.champions[x.room_id]=x.student_id;
  });

  DATA.autoExport=
    localStorage.getItem(AUTO_EXPORT_KEY)==='1';

  await loadStaffData();
  await loadEvalData();
  await loadCeoInbox();
}

async function loadStaffData(){

  DATA.employees=[];
  DATA.tasks=[];
  DATA.groups=[];
  DATA.taskTemplates=[];

  const isAdmin=
    currentAdmin || currentProfile?.role==='admin';

  if(!isAdmin && !currentEmployeeId) return;

  try{

    const empQ=db().from('employees')
      .select(isAdmin?'*':'id,name,job_title,is_ceo')
      .order('created_at',{ascending:true});

    const taskQ=db().from('tasks').select('*')
      .order('created_at',{ascending:false});

    const groupQ=db().from('task_groups').select('*')
      .order('created_at',{ascending:true});

    const tplQ=
      isAdmin
        ? sb(
            db().from('task_templates').select('*')
              .order('created_at',{ascending:true})
          ).catch(()=>[])
        : Promise.resolve([]);

    const [emps,tasks,groups,tpls]=await Promise.all([
      sb(empQ),
      sb(taskQ),
      sb(groupQ).catch(()=>[]),
      tplQ
    ]);

    DATA.taskTemplates=(tpls||[]).map(mapTemplate);

    DATA.employees=(emps||[]).map(mapEmployee);
    DATA.tasks=(tasks||[]).map(mapTask);
    DATA.groups=(groups||[]).map(mapGroup);

  }catch(e){

    console.warn(
      'تعذر تحميل الموظفين/المهام (هل تم إنشاء الجداول؟):',
      e
    );
  }
}

/* =========================================================
   تسجيل الدخول
   ========================================================= */

function setupLoginUI(){

  const role=$('screen-role');

  if(!role) return;

  populateTeacherSelect();
  populateEmployeeSelect();
}

async function populateEmployeeSelect(){

  const sel=$('employeeSelect');

  if(!sel) return;

  sel.innerHTML=
    '<option value="">جاري تحميل الأسماء...</option>';

  try{

    const rows=await sb(
      db()
      .from('employees')
      .select('id,name,is_ceo')
      .order('name',{ascending:true})
    );

    sel.innerHTML=
      '<option value="">اختر اسمك...</option>'+
      (rows||[]).filter(t=>!t.is_ceo).map(t=>`
        <option value="${t.id}">${esc(t.name)}</option>
      `).join('');

  }catch(e){

    sel.innerHTML=
      '<option value="">لا يوجد موظفون</option>';
  }
}

async function employeeCodeLogin(){

  try{

    const employeeId=
      $('employeeSelect')?.value;

    const code=
      $('employeeCodeInput')?.value.trim();

    if(!employeeId||!code){

      toast(
        'اختر اسمك وأدخل كود الدخول.',
        true
      );

      return;
    }

    const row=await sb(
      db().rpc('verify_employee_login',{
        p_id:employeeId,
        p_code:code
      })
    );

    if(!row){

      toast(
        'الكود غير صحيح.',
        true
      );

      return;
    }

    if(row.is_ceo){

      toast(
        'استخدم خانة "مدير الأكاديمية" للدخول.',
        true
      );

      return;
    }

    currentUser={employeeLogin:true,name:row.name};
    currentProfile=null;
    currentAdmin=false;
    currentTeacherId=null;
    currentEmployeeId=row.id;

    try{
      localStorage.setItem('saqifah:employeeSession',row.id);
    }catch{}

    await loadData();

    employeeTab='tasks';

    showScreen('screen-employee');

    renderEmployee();

    toast('تم تسجيل الدخول بنجاح');

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

async function populateTeacherSelect(){

  const sel=$('teacherSelect');

  if(!sel) return;

  sel.innerHTML=
    '<option value="">جاري تحميل الأسماء...</option>';

  try{

    const rows=await sb(
      db()
      .from('teachers')
      .select('id,name')
      .order('name',{ascending:true})
    );

    sel.innerHTML=
      '<option value="">اختر اسمك...</option>'+
      (rows||[]).map(t=>`
        <option value="${t.id}">${esc(t.name)}</option>
      `).join('');

  }catch(e){

    sel.innerHTML=
      '<option value="">تعذر تحميل الأسماء</option>';
  }
}

async function teacherCodeLogin(){

  try{

    const teacherId=
      $('teacherSelect')?.value;

    const code=
      $('teacherCodeInput')?.value.trim();

    if(!teacherId||!code){

      toast(
        'اختر اسمك وأدخل كود الدخول.',
        true
      );

      return;
    }

    const row=await sb(
      db().rpc('verify_teacher_login',{
        p_id:teacherId,
        p_code:code
      })
    );

    if(!row){

      toast(
        'الكود غير صحيح.',
        true
      );

      return;
    }

    currentUser={codeLogin:true,name:row.name};
    currentProfile=null;
    currentAdmin=false;
    currentTeacherId=row.id;

    try{
      localStorage.setItem('saqifah:teacherSession',row.id);
      localStorage.setItem('saqifah:teacherCode',code);
    }catch{}

    await loadData();

    selectedTeacherRoomId=
      teacherRooms()[0]?.id||null;

    teacherTab='reports';

    showScreen('screen-teacher');

    renderTeacher();

    toast('تم تسجيل الدخول بنجاح');

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

async function adminLogin(){

  try{

    const email=
      $('adminEmailInput')?.value.trim();

    const password=
      $('adminPwInput')?.value;

    if(!email||!password){

      toast(
        'أدخل البريد الإلكتروني وكلمة المرور.',
        true
      );

      return;
    }

    await sb(
      db().auth.signInWithPassword({
        email,
        password
      })
    );

    await loadSessionProfile();

    if(
      currentProfile?.role!=='admin'
    ){

      await db().auth.signOut();
      resetSession();

      toast(
        'هذا الحساب ليس حساب إدارة.',
        true
      );

      return;
    }

    await loadData();

    currentAdmin=true;
    adminTab='rooms';

    showScreen('screen-admin');

    renderAdmin();

    toast('مرحبًا بك في لوحة الإدارة');

  }catch(e){

    console.error(e);

    toast(
      friendlyError(e),
      true
    );
  }
}

async function loadSessionProfile(){

  const {data,error}=
    await db().auth.getUser();

  if(error) throw error;

  currentUser=data.user;

  if(!currentUser){
    throw new Error(
      'لم يتم العثور على جلسة.'
    );
  }

  currentProfile=await sb(
    db()
    .from('profiles')
    .select('*')
    .eq('id',currentUser.id)
    .single()
  );
}

function resetSession(){

  currentUser=null;
  currentProfile=null;
  currentAdmin=false;
  currentTeacherId=null;
  currentEmployeeId=null;
  currentIsCeo=false;
  currentCeoCode='';

}

async function logout(){

  try{

    if(currentUser?.employeeLogin){

      localStorage.removeItem(
        'saqifah:employeeSession'
      );

      localStorage.removeItem(
        'saqifah:ceoSession'
      );

    }else if(currentUser?.codeLogin){

      localStorage.removeItem(
        'saqifah:teacherSession'
      );

      localStorage.removeItem(
        'saqifah:teacherCode'
      );

    }else{

      await db().auth.signOut();
    }

  }catch{}

  resetSession();

  showScreen('screen-role');

  setupLoginUI();

  toast('تم تسجيل الخروج');
}

/* =========================================================
   الهيدر والتنقل
   ========================================================= */

function renderHeaderActions(){

  const h=$('headerActions');

  if(!h) return;

  h.innerHTML=currentUser
    ? `
      <span class="user-chip">
        ${currentUser?.ceoLogin?'<span class="ceo-dot"></span>':''}${esc(
          currentProfile?.full_name||
          currentUser.name||
          currentUser.email
        )}
      </span>

      <button
        class="btn danger"
        onclick="logout()">
        تسجيل الخروج
      </button>
    `
    :'';
}

function navButton(id,label,active,fn){

  return `
    <button
      class="nav-btn ${active?'active':''}"
      onclick="${fn}">
      ${label}
    </button>
  `;
}

function sideCreditHtml(){
  return `<div class="side-credit" title="Abdulwahab Hanif">
    <img src="assets/ah-logo.png" alt="AH">
    <span>Designed by <b>AH</b></span>
  </div>`;
}

function renderAdminNav(){

  const n=$('adminNav');

  if(!n) return;

  n.innerHTML=[

    navButton(
      'rooms',
      'القاعات والدورات',
      adminTab==='rooms',
      "adminTab='rooms';renderAdmin()"
    ),

    navButton(
      'teachers',
      'المعلمون والمعلمات',
      adminTab==='teachers',
      "adminTab='teachers';renderAdmin()"
    ),

    navButton(
      'teacherEval',
      'تقييم المعلمين',
      adminTab==='teacherEval',
      "adminTab='teacherEval';renderAdmin()"
    ),

    navButton(
      'students',
      'الطلاب',
      adminTab==='students',
      "adminTab='students';renderAdmin()"
    ),

    navButton(
      'reports',
      'التقارير الأسبوعية',
      adminTab==='reports',
      "adminTab='reports';renderAdmin()"
    ),

    navButton(
      'announce',
      'الإعلانات',
      adminTab==='announce',
      "adminTab='announce';renderAdmin()"
    ),

    navButton(
      'staff',
      'الموظفون والمهام',
      adminTab==='staff',
      "adminTab='staff';staffNav.admin.view='home';renderAdmin()"
    ),

    navButton(
      'export',
      'التصدير',
      adminTab==='export',
      "adminTab='export';renderAdmin()"
    ),

    navButton(
      'settings',
      'الإعدادات',
      adminTab==='settings',
      "adminTab='settings';renderAdmin()"
    )

  ].join('')+sideCreditHtml();
}

function renderTeacherNav(){

  const n=$('teacherNav');

  if(!n) return;

  n.innerHTML=[

    navButton(
      'reports',
      'التقارير الأسبوعية',
      teacherTab==='reports',
      "teacherTab='reports';renderTeacher()"
    ),

    navButton(
      'evals',
      'تقييماتي',
      teacherTab==='evals',
      "teacherTab='evals';renderTeacher()"
    ),

    navButton(
      'attend',
      'تحضيري',
      teacherTab==='attend',
      "teacherTab='attend';renderTeacher()"
    ),

    navButton(
      'announce',
      'الإعلانات',
      teacherTab==='announce',
      "teacherTab='announce';renderTeacher()"
    ),

    navButton(
      'settings',
      'الإعدادات',
      teacherTab==='settings',
      "teacherTab='settings';renderTeacher()"
    )

  ].join('')+sideCreditHtml();
}

/* =========================================================
   لوحة الإدارة
   ========================================================= */

function renderAdmin(){

  renderHeaderActions();
  renderAdminNav();

  const m=$('adminMain');

  if(!m) return;

  const views={

    rooms:renderAdminRooms,

    teachers:renderAdminTeachers,

    teacherEval:renderAdminTeacherEval,

    students:renderAdminStudents,

    reports:renderAdminReports,

    announce:renderAdminAnnouncements,

    staff:renderAdminStaff,

    export:renderAdminExport,

    settings:renderAdminSettings

  };

  m.innerHTML=views[adminTab]();
}


/* =========================================================
   القاعات والدورات
   ========================================================= */

function renderAdminRooms(){

  return panel(
    'القاعات والدورات',

    `
    <form
      onsubmit="addRoom(event)"
      class="form-grid">

      <input
        id="roomName"
        class="input"
        placeholder="اسم القاعة"
        required>

      <input
        id="roomCourse"
        class="input"
        placeholder="اسم الدورة / المستوى">

      <datalist id="groupNameList">
        ${DATA.groups.map(g=>`<option value="${esc(g.name)}">`).join('')}
      </datalist>

      <input
        id="roomGroupName"
        class="input"
        list="groupNameList"
        placeholder="اسم المجموعة (مثال: معهد ابن حجر)">

      <div class="duration-field">

        <input
          id="roomDuration"
          type="number"
          min="1"
          class="input"
          placeholder="مدة الدورة">

        <select
          id="roomDurationUnit"
          class="input">

          <option value="days">أيام</option>
          <option value="weeks">أسابيع</option>

        </select>

      </div>

      <select
        id="roomTeacher"
        class="input">

        <option value="">
          بدون معلم
        </option>

        ${DATA.teachers.map(t=>`

          <option value="${t.id}">
            ${esc(t.name)}
          </option>

        `).join('')}

      </select>

      <button
        class="btn primary">
        إضافة القاعة
      </button>

    </form>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>القاعة</th>
            <th>الدورة</th>
            <th>المجموعة</th>
            <th>المدة</th>
            <th>المعلم</th>
            <th>الطلاب</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${DATA.rooms.map(r=>`

            <tr>

              <td>
                ${esc(r.name)}
              </td>

              <td>
                ${esc(r.course)}
              </td>

              <td>
                ${esc(r.groupName||'-')}
              </td>

              <td>
                ${fmtDuration(r.durationDays)}
              </td>

              <td>
                ${esc(
                  getTeacher(r.teacherId)?.name||
                  'غير محدد'
                )}
              </td>

              <td>
                ${
                  DATA.students.filter(
                    s=>s.roomId===r.id
                  ).length
                }
              </td>

              <td>

                <button class="btn ghost small" onclick="editRoom('${r.id}')">تعديل</button>
<button
                  class="btn danger small"
                  onclick="deleteRoom('${r.id}')">

                  حذف

                </button>

              </td>

            </tr>

          `).join('')}

        </tbody>

      </table>

    </div>
    `
  );
}

async function addRoom(e){

  e.preventDefault();

  try{

    const row=await sb(

      db()
      .from('rooms')
      .insert({

        name:$('roomName').value.trim(),

        course:
          $('roomCourse').value.trim(),

        group_name:
          $('roomGroupName').value.trim(),

        duration_days:
          toDays(
            $('roomDuration').value,
            $('roomDurationUnit').value
          ),

        duration_weeks:
          toDays(
            $('roomDuration').value,
            $('roomDurationUnit').value
          )
            ? Math.ceil(
                toDays(
                  $('roomDuration').value,
                  $('roomDurationUnit').value
                )/7
              )
            : null,

        teacher_id:
          $('roomTeacher').value||null

      })
      .select()
      .single()

    );

    DATA.rooms.push(
      mapRoom(row)
    );

    toast('تمت إضافة القاعة');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

async function deleteRoom(id){

  if(!confirm(
    'حذف القاعة؟ سيتم إبقاء الطلاب والتقييمات بدون ربط بالقاعة.'
  )){
    return;
  }

  try{

    await sb(
      db()
      .from('students')
      .update({room_id:null})
      .eq('room_id',id)
    );

    await sb(
      db()
      .from('evaluations')
      .update({room_id:null})
      .eq('room_id',id)
    );

    await sb(
      db()
      .from('champions')
      .delete()
      .eq('room_id',id)
    );

    await sb(
      db()
      .from('rooms')
      .delete()
      .eq('id',id)
    );

    DATA.rooms=
      DATA.rooms.filter(x=>x.id!==id);

    DATA.students.forEach(x=>{
      if(x.roomId===id){
        x.roomId=null;
      }
    });

    DATA.evaluations.forEach(x=>{
      if(x.roomId===id){
        x.roomId=null;
      }
    });

    delete DATA.champions[id];

    toast('تم حذف القاعة');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

/* =========================================================
   المعلمون
   ========================================================= */

function renderAdminTeachers(){

  return panel(
    'المعلمون والمعلمات',

    `
    <div class="notice">

      عند إضافة معلم جديد يتم توليد كود دخول
      خاص به تلقائيًا. أعطِ المعلم اسمه (كما
      سيظهر في القائمة) والكود، ويستخدمهما
      للدخول من الصفحة الرئيسية بدون بريد
      إلكتروني أو كلمة مرور.

    </div>

    <form
      onsubmit="addTeacher(event)"
      class="form-grid">

      <input
        id="teacherName"
        class="input"
        placeholder="اسم المعلم/ـة"
        required>

      <input
        id="teacherPhone"
        class="input"
        placeholder="رقم الجوال">

      <select
        id="teacherGender"
        class="input">

        <option value="m">معلّم</option>
        <option value="f">معلّمة</option>

      </select>

      <button
        class="btn primary">

        إضافة معلم

      </button>

    </form>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>الاسم</th>
            <th>الجوال</th>
            <th>الفئة</th>
            <th>كود الدخول</th>
            <th>القاعات</th>
            <th>مجلد Drive</th>
            <th></th>

          </tr>

        </thead>

        <tbody>

          ${DATA.teachers.map(t=>`

            <tr>

              <td>
                ${esc(t.name)}
              </td>

              <td>
                ${esc(t.phone)}
              </td>

              <td>
                ${evGenderPill(t.gender)||'-'}
              </td>

              <td class="ltr">
                <strong>${esc(t.loginCode||'-')}</strong>
              </td>

              <td>

                ${
                  DATA.rooms
                    .filter(r=>r.teacherId===t.id)
                    .map(r=>esc(r.name))
                    .join('، ')||'-'
                }

              </td>

              <td>

                ${
                  t.driveFolderUrl
                  ? `<a class="link" href="${esc(t.driveFolderUrl)}" target="_blank" rel="noopener">فتح المجلد</a>`
                  : '<span class="hint" style="margin:0;">لا يوجد</span>'
                }

              </td>

              <td style="display:flex;gap:6px;flex-wrap:wrap;">

                <button
                  class="btn ghost small"
                  onclick="createTeacherDriveFolder('${t.id}')">

                  ${t.driveFolderUrl?'تحديث مجلد Drive':icon('folder')+' إنشاء مجلد Drive'}

                </button>

                <button
                  class="btn ghost small"
                  onclick="regenerateTeacherCode('${t.id}')">

                  كود جديد

                </button>

                <button class="btn ghost small" onclick="editTeacher('${t.id}')">تعديل</button>
<button
                  class="btn danger small"
                  onclick="deleteTeacher('${t.id}')">

                  حذف

                </button>

              </td>

            </tr>

          `).join('')}

        </tbody>

      </table>

    </div>
    `
  );
}

async function addTeacher(e){

  e.preventDefault();

  try{

    const row=await sb(

      db()
      .from('teachers')
      .insert({

        name:
          $('teacherName').value.trim(),

        phone:
          $('teacherPhone').value.trim(),

        gender:
          $('teacherGender').value,

        login_code:genTeacherCode()

      })
      .select()
      .single()

    );

    DATA.teachers.push(
      mapTeacher(row)
    );

    toast(
      `تمت إضافة المعلم — كود الدخول: ${row.login_code}`
    );

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

async function regenerateTeacherCode(id){

  if(!confirm(
    'توليد كود دخول جديد لهذا المعلم؟ سيتوقف الكود القديم عن العمل فورًا.'
  )){
    return;
  }

  try{

    const newCode=genTeacherCode();

    const row=await sb(

      db()
      .from('teachers')
      .update({login_code:newCode})
      .eq('id',id)
      .select()
      .single()

    );

    const t=getTeacher(id);

    if(t){
      t.loginCode=row.login_code;
    }

    toast(
      `الكود الجديد: ${row.login_code}`
    );

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

async function deleteTeacher(id){

  if(!confirm('حذف المعلم؟')){
    return;
  }

  try{

    await sb(
      db()
      .from('rooms')
      .update({teacher_id:null})
      .eq('teacher_id',id)
    );

    await sb(
      db()
      .from('evaluations')
      .update({teacher_id:null})
      .eq('teacher_id',id)
    );

    await sb(
      db()
      .from('reports')
      .update({teacher_id:null})
      .eq('teacher_id',id)
    );

    await sb(
      db()
      .from('profiles')
      .update({teacher_id:null})
      .eq('teacher_id',id)
    );

    await sb(
      db()
      .from('teachers')
      .delete()
      .eq('id',id)
    );

    DATA.rooms.forEach(r=>{
      if(r.teacherId===id){
        r.teacherId=null;
      }
    });

    DATA.evaluations.forEach(r=>{
      if(r.teacherId===id){
        r.teacherId=null;
      }
    });

    DATA.reports.forEach(r=>{
      if(r.teacherId===id){
        r.teacherId=null;
      }
    });

    DATA.teachers=
      DATA.teachers.filter(
        t=>t.id!==id
      );

    toast('تم حذف المعلم');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

/* =========================================================
   مجلد Drive الخاص بالمعلم (إنشاء + مزامنة تلقائية)
   ========================================================= */

async function callDriveWebApp(payload){

  if(
    !DRIVE_SYNC_WEBAPP_URL ||
    DRIVE_SYNC_WEBAPP_URL.includes('PASTE_')
  ){
    throw new Error(
      'لم يتم ضبط رابط Google Apps Script بعد. راجع خطوات الإعداد.'
    );
  }

  const res=await fetch(DRIVE_SYNC_WEBAPP_URL,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({
      ...payload,
      secret:DRIVE_SYNC_SHARED_SECRET
    })
  });

  const json=await res.json().catch(()=>null);

  if(!res.ok || !json || json.ok===false){
    throw new Error(
      json?.error || 'تعذر الاتصال بخدمة Google Drive.'
    );
  }

  return json;
}

async function createTeacherDriveFolder(id){

  const t=getTeacher(id);

  if(!t) return;

  try{

    toast('جاري إنشاء/تحديث مجلد Drive...');

    const result=await callDriveWebApp({
      action:'create_folder',
      teacherId:t.id,
      teacherName:t.name
    });

    await sb(
      db()
      .from('teachers')
      .update({
        drive_folder_id:result.folderId,
        drive_folder_url:result.folderUrl
      })
      .eq('id',id)
    );

    t.driveFolderId=result.folderId;
    t.driveFolderUrl=result.folderUrl;

    toast('تم إنشاء مجلد Drive. افتح الرابط وشاركه مع المعلم.');

    renderAdmin();

  }catch(x){

    toast(
      x.message||'حدث خطأ',
      true
    );
  }
}

async function syncTeacherDriveNow(tid){

  try{

    toast('جاري مزامنة الملفات من Drive...');

    const result=await callDriveWebApp({
      action:'sync_now',
      teacherId:tid
    });

    if(result?.result?.week){
      adminTeacherEvalWeek=result.result.week;
    }

    await refreshData();

    toast('تمت المزامنة من Drive (الأسبوع '+(result?.result?.week||'')+').');

  }catch(x){

    toast(
      x.message||'حدث خطأ',
      true
    );
  }
}

/* =========================================================
   تقييم المعلمين والمعلمات (مدمج من منصة التقييم الأخرى)
   ========================================================= */

const EV_DEFAULT_CRITERIA = [
  { key:'nonClass',   label:'المهام غير الصفية',            max:10 },
  { key:'kahoot',     label:'الألعاب اللغوية (كاهوت)',      max:10 },
  { key:'punctual',   label:'الالتزام بمواعيد المحاضرات',   max:10 },
  { key:'attendance', label:'الحضور المبكر والتأخر',        max:10 },
  { key:'creativity', label:'الابتكار والإبداع التعليمي',   max:10 },
  { key:'ppt',        label:'عروض البوربوينت',              max:10 },
  { key:'enrich',     label:'الأنشطة الإثرائية',            max:10 },
  { key:'ai',         label:'تفعيل أدوات الذكاء الاصطناعي', max:10 }
];

const EV_LOGO_PROGRAM = 'assets/Arabic_logo.png';
const EV_LOGO_ORG = 'assets/logo-saqifah.png';

let evTab = 'score';
let evWeek = 1;
let evReportWeek = 1;
let evDraft = {};
let evCritEditorOpen = false;
let evCertEditorOpen = false;
let evReportEditorOpen = false;
let evCertTeacherId = '';
let evDeductTeacher = '';
const evSaveTimers = {};

function evEmptySettings(){
  return {course:null, criteria:null, cert:null, report:null, reportNotes:{}, weekTypes:{}, courseEvals:{}, employeeShortNames:{}};
}

function mapTeacherScore(r){
  return {
    id:r.id,
    teacherId:r.teacher_id,
    week:Number(r.week||1),
    scores:r.scores||{}
  };
}

/* ---------- التحضير اليومي (بصمة الحضور) ---------- */

function attCourseCfg(){
  const c=DATA.evalSettings.course||{};
  return {
    startTime:c.startTime||'08:00',
    graceMinutes:Number(c.graceMinutes??10),
    absentAfterMinutes:Number(c.absentAfterMinutes??30),
    startDate:c.startDate||''
  };
}

function attStatus(rec){
  const cfg=attCourseCfg();
  const t=new Date(rec.ts);
  const [h,m]=cfg.startTime.split(':').map(Number);
  const grace=new Date(t);
  grace.setHours(h,m+cfg.graceMinutes,0,0);
  const absent=new Date(t);
  absent.setHours(h,m+cfg.absentAfterMinutes,0,0);
  return t<=grace?'حاضر':(t<=absent?'متأخر':'غائب');
}

function attBadge(st){
  return st==='حاضر'?'done':(st==='متأخر'?'doing':'overdue');
}

function attLimit(mins){
  const cfg=attCourseCfg();
  const [h,m]=cfg.startTime.split(':').map(Number);
  const d=new Date(2000,0,1,h,m+Number(mins||0));
  return d.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
}

function attCourseDays(){
  const cfg=attCourseCfg();
  if(!cfg.startDate) return [];
  const isoLocal=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const [h,m]=cfg.startTime.split(':').map(Number);
  const now=new Date();
  const todayIso=isoLocal(now);
  const days=[];
  const d=new Date(cfg.startDate+'T12:00:00');
  const end=new Date();
  end.setHours(23,59,59,999);
  while(d<=end){
    const dow=d.getDay();
    if(dow!==5 && dow!==6){
      const iso=isoLocal(d);
      const cut=new Date(d);
      cut.setHours(h,m+cfg.absentAfterMinutes,0,0);
      if(iso<todayIso || (iso===todayIso && now>cut)) days.push(iso);
    }
    d.setDate(d.getDate()+1);
  }
  return days;
}

function attNoShowDays(teacherId){
  const recs=new Set((DATA.attendance||[]).filter(r=>r.teacherId===teacherId).map(r=>r.date));
  return attCourseDays().filter(d=>!recs.has(d)).length;
}

function attTodayRec(){
  const today=new Date().toISOString().slice(0,10);
  return (DATA.attendance||[]).find(r=>
    r.teacherId===currentTeacherId && r.date===today
  );
}

async function teacherCheckIn(){

  if(attTodayRec()) return;

  const now=new Date();
  const rec={
    teacherId:currentTeacherId,
    date:now.toISOString().slice(0,10),
    ts:now.toISOString()
  };
  DATA.attendance=(DATA.attendance||[]).concat([rec]);

  try{
    await sb(
      db()
      .from('app_settings')
      .upsert({
        key:'attendance',
        value:DATA.attendance,
        updated_at:new Date().toISOString()
      })
    );
    toast('تم تسجيل حضورك اليوم.');
  }catch(e){
    toast('تم تسجيل حضورك محليًا — سيُعتمد بعد تفعيل صلاحية الحفظ.',true);
  }
  renderTeacher();
}

function renderTeacherAttendance(){

  const rec=attTodayRec();
  const mine=(DATA.attendance||[])
    .filter(r=>r.teacherId===currentTeacherId)
    .sort((a,b)=>b.date.localeCompare(a.date))
    .slice(0,14);
  const cfg=attCourseCfg();

  const fmtT=ts=>
    new Date(ts).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
  const fmtD=d=>
    new Date(d+'T12:00:00').toLocaleDateString('ar-SA',{weekday:'long',day:'numeric',month:'long'});

  return panel(
    'تحضيري',

    `
    <div class="notice">
      بصمة الحضور اليومية: اضغط الزر عند وصولك. يُسجَّل وقت الحضور
      بدقة ويُقارن ببداية المحاضرة (${esc(cfg.startTime)}):
      حاضر حتى ${attLimit(cfg.graceMinutes)}،
      متأخر حتى ${attLimit(cfg.absentAfterMinutes)}، وبعدها يُحسب غائبًا.
    </div>

    <div class="card-inner" style="text-align:center;padding:26px 16px;">
      ${
        rec
        ? `
          <div style="color:var(--green);">${icon('checkCircle',42)}</div>
          <h3 style="margin:8px 0 4px;">تم تسجيل حضورك اليوم</h3>
          <div class="hint">
            الساعة ${fmtT(rec.ts)} —
            <b class="${attStatus(rec)==='حاضر'?'':'warn'}">${attStatus(rec)}</b>
          </div>
        `
        : `
          <button class="btn btn-primary" style="font-size:17px;padding:16px 34px;"
            onclick="teacherCheckIn()">
            ${icon('hand',20)} تسجيل الحضور الآن
          </button>
          <div class="hint" style="margin-top:10px;">
            تُسجَّل بصمة واحدة فقط لكل يوم.
          </div>
        `
      }
    </div>

    <div class="card-inner" style="margin-top:14px;">
      <h3>سجل حضوري</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>اليوم</th><th>وقت البصمة</th><th>الحالة</th></tr></thead>
          <tbody>
            ${
              mine.length
              ? mine.map(r=>`
                  <tr>
                    <td>${fmtD(r.date)}</td>
                    <td>${fmtT(r.ts)}</td>
                    <td><span class="status-badge ${attBadge(attStatus(r))}">${attStatus(r)}</span></td>
                  </tr>`).join('')
              : '<tr><td colspan="3">لا توجد بصمات مسجلة بعد.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
    `
  );
}

function renderEvAttendance(){

  const cfg=attCourseCfg();
  const c=DATA.evalSettings.course||{};
  const teachers=DATA.teachers.filter(t=>
    DATA.rooms.some(r=>r.teacherId===t.id)
  );

  const fmtT=ts=>
    new Date(ts).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
  const fmtD=d=>
    new Date(d+'T12:00:00').toLocaleDateString('ar-SA',{weekday:'long',day:'numeric',month:'long'});

  const rows=(DATA.attendance||[])
    .slice()
    .sort((a,b)=>b.ts.localeCompare(a.ts))
    .slice(0,60);

  const summary=t=>{
    const mine=(DATA.attendance||[]).filter(r=>r.teacherId===t.id);
    const onTime=mine.filter(r=>attStatus(r)==='حاضر').length;
    const late=mine.filter(r=>attStatus(r)==='متأخر').length;
    const absent=mine.filter(r=>attStatus(r)==='غائب').length+attNoShowDays(t.id);
    return {onTime, late, absent, days:mine.length};
  };

  return panel(
    'الحضور والبصمة',

    `
    <div class="notice">
      بصمة حضور المعلمين اليومية. الحالة تُحسب من وقت بداية المحاضرة:
      حاضر خلال دقائق السماح، ثم متأخر حتى حد الغياب، وبعدها غائب.
      أيام الدورة بلا بصمة تُحسب غيابًا (عدا الجمعة والسبت).
      وتُغذي معياري «الحضور المبكر والتأخر»
      و«الالتزام بمواعيد المحاضرات» في التقييم الأسبوعي.
    </div>

    <div class="card-inner" style="margin-bottom:14px;">
      <h3>إعداد المحاضرة</h3>
      <div class="form-grid">
        <div class="field">
          <label class="modal-label">وقت بداية المحاضرة</label>
          <input class="input" type="time" value="${esc(cfg.startTime)}"
            onchange="evCourseSet('startTime',this.value)">
        </div>
        <div class="field">
          <label class="modal-label">دقائق السماح قبل الاحتساب متأخرًا</label>
          <input class="input" type="number" min="0" value="${cfg.graceMinutes}"
            onchange="evCourseSet('graceMinutes',Number(this.value)||0)">
        </div>
        <div class="field">
          <label class="modal-label">يُحسب غائبًا بعد (دقيقة من بداية المحاضرة)</label>
          <input class="input" type="number" min="0" value="${cfg.absentAfterMinutes}"
            onchange="evCourseSet('absentAfterMinutes',Number(this.value)||0)">
        </div>
        <div class="field">
          <label class="modal-label">تاريخ بداية الدورة</label>
          <input class="input" type="date" value="${esc(cfg.startDate)}"
            onchange="evCourseSet('startDate',this.value)">
        </div>
      </div>
    </div>

    <div class="card-inner" style="margin-bottom:14px;">
      <h3>ملخص لكل معلم</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>المعلم</th><th>حاضر</th><th>متأخر</th><th>غائب</th><th>أيام البصمات</th></tr></thead>
          <tbody>
            ${
              teachers.map(t=>{
                const sm=summary(t);
                return `
                  <tr>
                    <td class="nm">${esc(t.name)}</td>
                    <td>${sm.onTime}</td>
                    <td>${sm.late}</td>
                    <td>${sm.absent}</td>
                    <td>${sm.days}</td>
                  </tr>`;
              }).join('') || '<tr><td colspan="5">لا يوجد معلمون بعد.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card-inner">
      <h3>سجل البصمات</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>اليوم</th><th>المعلم</th><th>وقت البصمة</th><th>الحالة</th></tr></thead>
          <tbody>
            ${
              rows.length
              ? rows.map(r=>`
                  <tr>
                    <td>${fmtD(r.date)}</td>
                    <td class="nm">${esc(getTeacher(r.teacherId)?.name||'—')}</td>
                    <td>${fmtT(r.ts)}</td>
                    <td><span class="status-badge ${attBadge(attStatus(r))}">${attStatus(r)}</span></td>
                  </tr>`).join('')
              : '<tr><td colspan="4">لا توجد بصمات مسجلة بعد.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
    `
  );
}

function evCourseSet(key,val){
  if(!DATA.evalSettings.course) DATA.evalSettings.course={};
  DATA.evalSettings.course[key]=val;
  evQueueSave('course');
}

/* ---------- تحميل وحفظ الإعدادات ---------- */

async function loadEvalData(){

  DATA.teacherScores=[];
  DATA.attendance=[];
  DATA.evalSettings=evEmptySettings();

  const isAdmin=
    currentAdmin || currentProfile?.role==='admin';

  if(!isAdmin && !currentTeacherId) return;

  try{

    const [scores,settings]=await Promise.all([
      sb(db().from('teacher_scores').select('*')).catch(()=>[]),
      sb(db().from('app_settings').select('*')).catch(()=>[])
    ]);

    DATA.teacherScores=(scores||[]).map(mapTeacherScore);

    (settings||[]).forEach(r=>{

      if(r.key==='course')       DATA.evalSettings.course=r.value;
      if(r.key==='criteria')     DATA.evalSettings.criteria=r.value;
      if(r.key==='cert')         DATA.evalSettings.cert=r.value;
      if(r.key==='report')       DATA.evalSettings.report=r.value;
      if(r.key==='report_notes') DATA.evalSettings.reportNotes=r.value||{};
      if(r.key==='week_types')   DATA.evalSettings.weekTypes=r.value||{};
      if(r.key==='course_evals') DATA.evalSettings.courseEvals=r.value||{};
      if(r.key==='attendance')   DATA.attendance=r.value||[];
      if(r.key==='employee_short_names') DATA.evalSettings.employeeShortNames=r.value||{};
    });

  }catch(e){

    console.warn('تعذر تحميل بيانات تقييم المعلمين:',e);
  }
}

function evQueueSave(key){

  clearTimeout(evSaveTimers[key]);

  evSaveTimers[key]=setTimeout(()=>evSaveSetting(key),700);
}

async function evSaveSetting(key){

  const s=DATA.evalSettings;

  const values={
    course:s.course,
    criteria:s.criteria,
    cert:s.cert,
    report:s.report,
    report_notes:s.reportNotes,
    week_types:s.weekTypes,
    course_evals:s.courseEvals,
    employee_short_names:s.employeeShortNames,
    attendance:DATA.attendance
  };

  try{

    await sb(
      db()
      .from('app_settings')
      .upsert(
        {
          key,
          value:values[key]??null,
          updated_at:new Date().toISOString()
        },
        {onConflict:'key'}
      )
    );

  }catch(x){

    toast(
      'تعذر حفظ الإعدادات — شغّل ملف v3_setup.sql في Supabase. '+friendlyError(x),
      true
    );
  }
}

/* ---------- الحسابات ---------- */

function evCriteria(){

  const c=DATA.evalSettings.criteria;

  return Array.isArray(c)&&c.length?c:EV_DEFAULT_CRITERIA;
}

function evEnsureCriteria(){

  const s=DATA.evalSettings;

  if(!Array.isArray(s.criteria)||!s.criteria.length){
    s.criteria=EV_DEFAULT_CRITERIA.map(c=>({...c}));
  }

  return s.criteria;
}

function evCourseName(){

  return DATA.evalSettings.course?.name || 'دورة تعلّم العربية';
}

function evCourseWeeks(){

  const w=Number(DATA.evalSettings.course?.weeks);

  if(w>0) return w;

  const fromRooms=
    Math.max(0,...DATA.rooms.map(r=>r.durationWeeks||0));

  return fromRooms||4;
}

function evScoreRow(tid,week){

  return DATA.teacherScores.find(
    r=>r.teacherId===tid && r.week===week
  );
}

function evWeekTotal(tid,week){

  const row=evScoreRow(tid,week);

  if(!row) return 0;

  return evCriteria().reduce(
    (s,c)=>s+(Number(row.scores[c.key])||0),
    0
  );
}

function evCumulative(tid){

  return DATA.teacherScores
    .filter(r=>r.teacherId===tid)
    .reduce((s,r)=>s+evWeekTotal(tid,r.week),0);
}

function evMaxPerWeek(){

  return evCriteria().reduce((s,c)=>s+c.max,0);
}

function evSavedWeeks(){

  return new Set(
    DATA.teacherScores.map(r=>r.week)
  ).size;
}

function getTeacherAverage(teacherId){

  const weeks=
    DATA.teacherScores.filter(r=>r.teacherId===teacherId);

  const max=evMaxPerWeek();

  if(!weeks.length || !max) return 0;

  const total=
    weeks.reduce((s,r)=>s+evWeekTotal(teacherId,r.week),0);

  return Math.round(total/(max*weeks.length)*100);
}

function evTeachersSorted(){

  const order={m:0,f:1,'':2};

  return DATA.teachers
    .slice()
    .sort((a,b)=>
      (order[a.gender||'']-order[b.gender||''])
    );
}

function evRanked(){

  return DATA.teachers
    .map(t=>({t,total:evCumulative(t.id)}))
    .sort((a,b)=>b.total-a.total);
}

function evGenderPill(g){

  if(g==='f'){
    return '<span class="gender-pill f">معلّمة</span>';
  }

  if(g==='m'){
    return '<span class="gender-pill m">معلّم</span>';
  }

  return '';
}

function evGenderCell(t){

  if(t.gender) return evGenderPill(t.gender);

  return `
    <select
      class="input"
      style="width:auto;padding:4px 8px;font-size:12px;"
      onchange="evSetGender('${t.id}',this.value)">

      <option value="">حدّد الفئة</option>
      <option value="m">معلّم</option>
      <option value="f">معلّمة</option>

    </select>
  `;
}

async function evSetGender(id,g){

  if(!g) return;

  try{

    const row=await updateRow('teachers',id,{gender:g});

    Object.assign(getTeacher(id),mapTeacher(row));

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- الصفحة الرئيسية للقسم ---------- */

function getTeacherDurationWeeks(){
  return evCourseWeeks();
}

function progressBarHtml(pct){

  const p=Math.max(0,Math.min(100,Number(pct)||0));

  return `
    <div class="progress-track">
      <div
        class="progress-fill ${scoreClass(p)}"
        style="width:${p}%;">
      </div>
    </div>
  `;
}

function renderAdminTeacherEval(){

  const tabs=[
    ['score','التقييم الأسبوعي'],
    ['attend','الحضور والبصمة'],
    ['board','لوحة المتصدّرين'],
    ['report',icon('file')+' التقرير الأسبوعي'],
    ['cert',icon('medal')+' الشهادات'],
    ['deduct','الخصومات']
  ];

  const bodies={
    score:renderEvScore,
    attend:renderEvAttendance,
    board:renderEvBoard,
    report:renderEvReport,
    cert:renderEvCert,
    deduct:renderEvDeductions
  };

  return panel(
    'تقييم المعلمين والمعلمات',

    `
    <div class="subtabs">

      ${tabs.map(([k,l])=>`
        <button
          class="subtab ${evTab===k?'active':''}"
          onclick="evGoTab('${k}')">
          ${l}
        </button>
      `).join('')}

    </div>

    ${
      DATA.teachers.length
      ? bodies[evTab]()
      : `
        <div class="notice">
          أضف المعلمين والمعلمات أولاً من قسم "المعلمون والمعلمات"،
          ثم ارجع هنا للتقييم.
        </div>
      `
    }
    `
  );
}

function evGoTab(k){

  evTab=k;
  evReportEditorOpen=false;
  evCertEditorOpen=false;

  renderAdmin();
}

/* ---------- 1) التقييم الأسبوعي ---------- */

function evDraftWeek(week){

  if(!evDraft[week]) evDraft[week]={};

  DATA.teachers.forEach(t=>{

    if(!evDraft[week][t.id]){

      evDraft[week][t.id]={
        ...(evScoreRow(t.id,week)?.scores||{})
      };
    }
  });

  return evDraft[week];
}

function evDraftTotal(tid,week){

  const d=evDraftWeek(week)[tid]||{};

  return evCriteria().reduce(
    (s,c)=>s+(Number(d[c.key])||0),
    0
  );
}

function renderEvScoreTable(){

  const crit=evCriteria();

  const draft=evDraftWeek(evWeek);

  return `

    <table class="score-table">

      <thead>
        <tr>
          <th>المعلّم / المعلّمة</th>
          ${crit.map(c=>`
            <th>${esc(c.label)}<small>من ${c.max}</small></th>
          `).join('')}
          <th>الإجمالي</th>
        </tr>
      </thead>

      <tbody>

        ${evTeachersSorted().map(t=>`

          <tr>

            <td>${esc(t.name)} ${evGenderCell(t)}</td>

            ${crit.map(c=>`
              <td>
                <input
                  type="number"
                  min="0"
                  max="${c.max}"
                  step="1"
                  data-t="${t.id}"
                  data-k="${c.key}"
                  value="${draft[t.id]?.[c.key]??''}"
                  oninput="evOnScore(this)">
              </td>
            `).join('')}

            <td
              class="total-cell"
              data-total-for="${t.id}">
              ${evDraftTotal(t.id,evWeek)}
            </td>

          </tr>

        `).join('')}

      </tbody>

    </table>

  `;
}

function evRefreshScoreTable(){

  const w=$('evScoreWrap');

  if(w){
    w.innerHTML=renderEvScoreTable();
  }
}

function evOnScore(inp){

  const max=Number(inp.max);

  let v=Number(inp.value);

  if(isNaN(v)) v=0;

  v=Math.max(0,Math.min(max,v));

  evDraftWeek(evWeek)[inp.dataset.t][inp.dataset.k]=v;

  const cell=
    document.querySelector(
      `[data-total-for="${inp.dataset.t}"]`
    );

  if(cell){
    cell.textContent=evDraftTotal(inp.dataset.t,evWeek);
  }
}

function renderEvCritEditor(){

  if(!evCritEditorOpen) return '';

  return `

    <div class="cert-editor open">

      <div class="cert-editor__head">
        <h3>${icon('edit')} معايير التقييم</h3>
        <span class="muted small">التغييرات تُحفظ تلقائيًا وتنعكس على الجدول والتقرير مباشرة</span>
      </div>

      <p class="cert-editor__hint">
        غيّر اسم أي معيار أو درجته القصوى، أو احذفه، أو أضف معيارًا جديدًا.
        الدرجات المسجلة سابقًا للمعايير المحذوفة لا تُحتسب في المجموع.
      </p>

      ${evCriteria().map((c,i)=>`

        <div class="crit-row">

          <label class="field crit-label-wrap">
            <span>اسم المعيار</span>
            <input
              type="text"
              class="input"
              value="${esc(c.label)}"
              oninput="evCritInput(${i},'label',this.value)"
              onchange="evCritBlur(${i},this)">
          </label>

          <label class="field crit-max-wrap">
            <span>الدرجة القصوى</span>
            <input
              type="number"
              class="input"
              min="1"
              max="100"
              value="${c.max}"
              oninput="evCritInput(${i},'max',this.value)"
              onchange="renderAdmin()">
          </label>

          <button
            type="button"
            class="btn danger small"
            onclick="evCritDelete(${i})">
            ${icon('trash')} حذف
          </button>

        </div>

      `).join('')}

      <div class="toolbar" style="margin-top:14px;margin-bottom:0;">

        <button
          type="button"
          class="btn primary small"
          onclick="evCritAdd()">
          + إضافة معيار
        </button>

        <button
          type="button"
          class="btn ghost small"
          onclick="evCritReset()">
          ${icon('refresh')} استرجاع المعايير الأصلية
        </button>

        <button
          type="button"
          class="btn ghost small"
          onclick="evCritEditorOpen=false;renderAdmin()">
          تم
        </button>

      </div>

    </div>

  `;
}

function evCritInput(i,field,value){

  const crit=evEnsureCriteria()[i];

  if(!crit) return;

  if(field==='label'){
    crit.label=value;
  }else{
    crit.max=Math.max(1,Math.min(100,Number(value)||1));
  }

  evQueueSave('criteria');

  evRefreshScoreTable();
}

function evCritBlur(i,el){

  const crit=evEnsureCriteria()[i];

  if(crit && !String(crit.label).trim()){

    crit.label='معيار جديد';

    evQueueSave('criteria');

    renderAdmin();
  }
}

function evCritDelete(i){

  const list=evEnsureCriteria();

  if(list.length<=1){

    toast('لازم يبقى معيار واحد على الأقل.',true);
    return;
  }

  if(!confirm(
    `حذف المعيار «${list[i].label}»؟ لن يُحتسب في المجاميع بعد الآن.`
  )){
    return;
  }

  list.splice(i,1);

  evQueueSave('criteria');

  renderAdmin();
}

function evCritAdd(){

  evEnsureCriteria().push({
    key:'c_'+Date.now(),
    label:'معيار جديد',
    max:10
  });

  evQueueSave('criteria');

  renderAdmin();

  const labels=
    document.querySelectorAll('.crit-label-wrap input');

  const last=labels[labels.length-1];

  if(last){
    last.focus();
    last.select();
  }
}

function evCritReset(){

  if(!confirm(
    'استرجاع المعايير الأصلية؟ سيتم حذف المعايير المضافة وتعديلاتك عليها.'
  )){
    return;
  }

  DATA.evalSettings.criteria=null;

  evQueueSave('criteria');

  renderAdmin();
}

function evSetCourse(field,value){

  const c=DATA.evalSettings.course||{};

  DATA.evalSettings.course={
    ...c,
    [field]:field==='weeks'
      ? Math.max(1,Number(value)||1)
      : String(value).trim()
  };

  evQueueSave('course');

  if(evWeek>evCourseWeeks()){
    evWeek=1;
  }

  renderAdmin();
}

function renderEvScore(){

  const weeks=evCourseWeeks();

  const noGender=
    DATA.teachers.filter(t=>!t.gender).length;

  return `

    <div class="card-inner">

      <div class="form-grid" style="margin-bottom:0;">

        <label class="field">
          <span class="modal-label">اسم الدورة</span>
          <input
            class="input"
            value="${esc(DATA.evalSettings.course?.name||'')}"
            placeholder="مثال: دورة تعلّم العربية - الدفعة الثالثة"
            onchange="evSetCourse('name',this.value)">
        </label>

        <label class="field">
          <span class="modal-label">مدة الدورة (بالأسابيع)</span>
          <input
            class="input"
            type="number"
            min="1"
            max="52"
            value="${weeks}"
            onchange="evSetCourse('weeks',this.value)">
        </label>

        <label class="field">
          <span class="modal-label">نوع تقييم الأسبوع ${evWeek}</span>
          <select
            class="input"
            onchange="evWeekType(this.value)">
            ${['تقييم دورة','متابعة مستمرة'].map(o=>`
              <option value="${o}" ${((DATA.evalSettings.weekTypes||{})[evWeek]||'تقييم دورة')===o?'selected':''}>${o}</option>
            `).join('')}
          </select>
        </label>

      </div>

    </div>

    ${
      noGender
      ? `
        <div class="notice">
          ${noGender} معلم/ة بدون فئة. حدّد الفئة (معلّم / معلّمة) من القائمة
          بجانب اسمه في الجدول حتى يظهر في لوحة المتصدّرين.
        </div>
      `
      : ''
    }

    <div class="toolbar">

      <button
        class="btn ghost small"
        onclick="evCritEditorOpen=!evCritEditorOpen;renderAdmin()">
        ${icon('edit')} تعديل معايير التقييم
      </button>

      <label class="btn ghost small" style="cursor:pointer;">
        ${icon('upload')} استيراد من Excel (المنصة القديمة)
        <input
          type="file"
          accept=".xlsx,.xls"
          hidden
          onchange="evImportExcel(this)">
      </label>

      <span style="flex:1;"></span>

      <div class="week-switcher">

        <button
          class="week-arrow"
          onclick="evStepWeek(-1)">‹</button>

        <span>الأسبوع ${evWeek} من ${weeks}</span>

        <button
          class="week-arrow"
          onclick="evStepWeek(1)">›</button>

      </div>

    </div>

    ${renderEvCritEditor()}

    <div class="notice">
      أدخل درجة كل معيار (من 0 إلى الدرجة القصوى) لكل معلم ومعلمة، ثم اضغط
      "حفظ درجات هذا الأسبوع". الدرجات غير المحفوظة تبقى في الصفحة فقط إلى أن تحفظها.
    </div>

    <div class="table-scroll" id="evScoreWrap">
      ${renderEvScoreTable()}
    </div>

    <div class="toolbar" style="margin-top:16px;">

      <button
        class="btn primary"
        onclick="evSaveWeek()">
        حفظ درجات الأسبوع ${evWeek}
      </button>

    </div>
  `;
}

function evStepWeek(d){

  const next=evWeek+d;

  if(next<1 || next>evCourseWeeks()) return;

  evWeek=next;

  renderAdmin();
}

async function evSaveWeek(){

  const week=evWeek;

  const draft=evDraftWeek(week);

  const rows=
    DATA.teachers
      .map(t=>({
        teacher_id:t.id,
        week,
        scores:draft[t.id]||{},
        updated_at:new Date().toISOString()
      }))
      .filter(r=>
        Object.keys(r.scores).length ||
        evScoreRow(r.teacher_id,week)
      );

  if(!rows.length){

    toast('لا توجد درجات لحفظها.',true);
    return;
  }

  try{

    const saved=await sb(
      db()
      .from('teacher_scores')
      .upsert(rows,{onConflict:'teacher_id,week'})
      .select()
    );

    (saved||[]).map(mapTeacherScore).forEach(n=>{

      DATA.teacherScores=
        DATA.teacherScores.filter(
          x=>!(x.teacherId===n.teacherId && x.week===n.week)
        );

      DATA.teacherScores.push(n);
    });

    toast(`تم حفظ درجات الأسبوع ${week}`);

  }catch(x){

    toast(
      'تعذر الحفظ — تأكد من تشغيل v3_setup.sql. '+friendlyError(x),
      true
    );
  }
}

/* ---------- 2) لوحة المتصدرين ---------- */

function evWinnerCard(label,item){

  if(!item || item.total===0){

    return `
      <div class="winner-card empty">
        <span class="medal">${icon('trophy',30)}</span>
        <span class="label">${label}</span>
        <div class="name">— لا توجد نتائج بعد —</div>
      </div>
    `;
  }

  return `
    <div class="winner-card">
      <span class="medal">${icon('trophy',30)}</span>
      <span class="label">${label}</span>
      <div class="name">${esc(item.t.name)}</div>
      <span class="pts">${item.total} نقطة</span>
    </div>
  `;
}

function renderEvBoard(){

  const ranked=evRanked();

  const bestM=ranked.find(x=>x.t.gender==='m' && x.total>0);
  const bestF=ranked.find(x=>x.t.gender==='f' && x.total>0);

  const weeksSaved=evSavedWeeks()||1;

  const maxTotal=evMaxPerWeek()*weeksSaved;

  return `

    <div class="notice">
      مجموع النقاط التراكمي عبر كل الأسابيع المحفوظة.
    </div>

    <div class="winners">
      ${evWinnerCard('أفضل معلّم',bestM)}
      ${evWinnerCard('أفضل معلّمة',bestF)}
    </div>

    <div class="table-scroll">

      <table class="rank-table">

        <thead>
          <tr>
            <th>الترتيب</th>
            <th>الاسم</th>
            <th>الفئة</th>
            <th>مجموع النقاط</th>
            <th style="width:30%;">النسبة</th>
          </tr>
        </thead>

        <tbody>

          ${ranked.map((x,i)=>{

            const pct=
              maxTotal?Math.round(x.total/maxTotal*100):0;

            return `
              <tr>

                <td>${i+1}</td>

                <td>${esc(x.t.name)}</td>

                <td>${evGenderPill(x.t.gender)||'-'}</td>

                <td>${x.total}</td>

                <td>
                  <div class="progress-row" style="margin:0;">
                    ${progressBarHtml(pct)}
                    <span class="progress-pct">${pct}%</span>
                  </div>
                </td>

              </tr>
            `;
          }).join('')}

        </tbody>

      </table>

    </div>

  `;
}

/* ---------- أدوات التاريخ والطباعة ---------- */

function evTodayStrings(){

  const now=new Date();

  const hijri=
    now.toLocaleDateString(
      'ar-SA-u-ca-islamic-umalqura',
      {year:'numeric',month:'long',day:'numeric'}
    )
    .replace(/[\s\u200f\u200e]*ه[ـ\u200d]?[\s\u200f\u200e]*$/,'')
    .trim();

  const greg=
    now.toLocaleDateString(
      'ar-SA-u-ca-gregory',
      {year:'numeric',month:'long',day:'numeric'}
    )
    .replace(/[\s\u200f\u200e]*م[\s\u200f\u200e]*$/,'')
    .trim();

  return {hijri,greg};
}

function evFmt(text,vars){

  return esc(text)
    .replace(/\{الأسبوع\}/g,vars.week??'')
    .replace(/\{الدورة\}/g,esc(vars.course??''))
    .replace(/\{عدد الأسابيع\}/g,vars.weeks??'')
    .replace(/\{النقاط\}/g,'<b>'+(vars.total??'')+'</b>')
    .replace(/\n/g,'<br>');
}

function evPrint(mode,title,html){

  document.getElementById('printRoot')?.remove();

  const root=document.createElement('div');

  root.id='printRoot';
  root.innerHTML=html;

  document.body.appendChild(root);

  const pageStyle=document.createElement('style');

  pageStyle.textContent=
    mode==='report'
      ? '@page{size:A4 landscape;margin:9mm 10mm;}'
      : '@page{size:A4 landscape;margin:0;}';

  document.head.appendChild(pageStyle);

  document.body.dataset.print=mode;

  const oldTitle=document.title;

  if(title) document.title=title;

  const done=()=>{

    delete document.body.dataset.print;
    document.title=oldTitle;
    pageStyle.remove();
    root.remove();

    window.removeEventListener('afterprint',done);
  };

  window.addEventListener('afterprint',done);

  window.print();
}

/* ---------- 3) التقرير الأسبوعي ---------- */

const EV_DEFAULT_REPORT = {
  title:'التقرير الأسبوعي لتقييم المعلمين والمعلّمات',
  subtitle:'برنامج «تعلّم العربية» — السقيفة',
  showLogoProgram:true, logoProgram:'',
  showLogoOrg:true,     logoOrg:'',

  showMeta:true,
  courseLabel:'الدورة',
  weekLabel:'الأسبوع',
  dateLabel:'تاريخ التقرير',
  dateText:'',

  showIntro:true,
  toName:'سعادة مدير الأكاديمية / د. بدر هديبان الحربي — حفظه الله',
  intro:'السلام عليكم ورحمة الله وبركاته، وبعد:\nنرفع لسعادتكم التقرير الأسبوعي لتقييم أداء المعلمين والمعلّمات في برنامج «تعلّم العربية» عن الأسبوع ({الأسبوع})، وفيما يلي بيان التقييمات:',

  colIndex:'م', colName:'الاسم', colGender:'الفئة',
  colTotal:'المجموع', colPercent:'النسبة', colRank:'الترتيب',
  genderM:'معلّم', genderF:'معلّمة',
  showGender:true, showPercent:true, showRank:true,

  showSummary:true,
  stat1:'عدد المعلمين والمعلّمات',
  stat2:'متوسط مجموع الأسبوع',
  stat3:'متميّز الأسبوع (معلّم)',
  stat4:'متميّزة الأسبوع (معلّمة)',

  notesTitle:'ملاحظات وتوصيات',

  showPrep:true,
  prepLabel:'إعداد التقرير',
  prepName:'',
  showApprove:true,
  approveLabel:'الاعتماد — مدير الأكاديمية',
  approveName:'د. بدر هديبان الحربي'
};

function evReport(){

  return Object.assign(
    {},
    EV_DEFAULT_REPORT,
    DATA.evalSettings.report||{}
  );
}

function evReportRanking(week){

  const ranked=
    DATA.teachers
      .map(t=>({...t,total:evWeekTotal(t.id,week)}))
      .sort((a,b)=>b.total-a.total);

  let lastTotal=null,lastRank=0;

  ranked.forEach((t,i)=>{

    if(t.total!==lastTotal){
      lastRank=i+1;
      lastTotal=t.total;
    }

    t.rank=lastRank;
  });

  return ranked;
}

function evReportHTML(week){

  const r=evReport();
  const crit=evCriteria();
  const ranked=evReportRanking(week);
  const maxWeek=evMaxPerWeek();
  const hasData=ranked.some(t=>t.total>0);
  const {hijri,greg}=evTodayStrings();
  const course=evCourseName();
  const weeks=evCourseWeeks();
  const vars={week,weeks,course};
  const notes=
    String((DATA.evalSettings.reportNotes||{})[week]||'').trim();

  const bestOf=g=>{

    const list=ranked.filter(t=>t.gender===g && t.total>0);

    if(!list.length) return null;

    const top=list[0].total;

    return {
      total:top,
      names:list.filter(t=>t.total===top).map(t=>t.name)
    };
  };

  const bm=bestOf('m');
  const bf=bestOf('f');

  const isTop=t=>
    t.total>0 && (
      (t.gender==='m' && bm && t.total===bm.total) ||
      (t.gender==='f' && bf && t.total===bf.total)
    );

  const avg=
    ranked.length
      ? Math.round(
          ranked.reduce((s,t)=>s+t.total,0)/ranked.length*10
        )/10
      : 0;

  const cell=(t,cr)=>
    Number(evScoreRow(t.id,week)?.scores?.[cr.key])||0;

  const rows=ranked.map((t,i)=>`

    <tr class="${isTop(t)?'is-top':''}">

      <td>${i+1}</td>

      <td class="nm">${esc(t.name)}</td>

      ${
        r.showGender
        ? `<td>${esc(
            t.gender==='f'?r.genderF:
            t.gender==='m'?r.genderM:'-'
          )}</td>`
        : ''
      }

      ${crit.map(cr=>`<td>${cell(t,cr)}</td>`).join('')}

      <td class="tot">${t.total}</td>

      ${
        r.showPercent
        ? `<td>${maxWeek?Math.round(t.total/maxWeek*100):0}%</td>`
        : ''
      }

      ${r.showRank?`<td>${t.rank}</td>`:''}

    </tr>

  `).join('');

  const logoP=
    r.showLogoProgram
      ? `<img src="${esc(r.logoProgram||EV_LOGO_PROGRAM)}" alt="" class="report__logo report__logo--program">`
      : '<span class="report__logo-spacer--program"></span>';

  const logoO=
    r.showLogoOrg
      ? `<img src="${esc(r.logoOrg||EV_LOGO_ORG)}" alt="" class="report__logo report__logo--org">`
      : '<span class="report__logo-spacer--org"></span>';

  const sig=(show,label,name)=>
    show
      ? `<div class="report__sig"><span>${esc(label)}</span><div class="line"></div><b>${name?esc(name):'&nbsp;'}</b></div>`
      : '<div class="report__sig" style="visibility:hidden"></div>';

  return `

  <div class="report" id="report">

    <div class="report__head">
      ${logoP}
      <div class="report__titlebox">
        <h1 class="report__title">${evFmt(r.title,vars)}</h1>
        <div class="report__sub">${evFmt(r.subtitle,vars)}</div>
      </div>
      ${logoO}
    </div>

    ${
      r.showMeta
      ? `
        <div class="report__meta">
          <div>${esc(r.courseLabel)}: <b>${esc(course)}</b></div>
          <div>${esc(r.weekLabel)}: <b>${week}</b> من ${weeks}</div>
          <div>${esc(r.dateLabel)}: ${
            r.dateText
            ? `<b>${esc(r.dateText)}</b>`
            : `<b>${hijri} هـ</b> — الموافق ${greg} م`
          }</div>
        </div>
      `
      : ''
    }

    ${
      r.showIntro
      ? `
        <div class="report__to">
          <b>${evFmt(r.toName,vars)}</b><br>
          ${evFmt(r.intro,vars)}
        </div>
      `
      : ''
    }

    ${
      hasData
      ? ''
      : '<p class="report__note">لم تُسجَّل درجات لهذا الأسبوع بعد — تظهر القيم أصفارًا إلى حين إدخال التقييمات.</p>'
    }

    <div class="report__tablewrap">

      <table class="report__table">

        <thead>
          <tr>
            <th>${esc(r.colIndex)}</th>
            <th>${esc(r.colName)}</th>
            ${r.showGender?`<th>${esc(r.colGender)}</th>`:''}
            ${crit.map(cr=>`<th>${esc(cr.label)}<small>من ${cr.max}</small></th>`).join('')}
            <th>${esc(r.colTotal)}<small>من ${maxWeek}</small></th>
            ${r.showPercent?`<th>${esc(r.colPercent)}</th>`:''}
            ${r.showRank?`<th>${esc(r.colRank)}</th>`:''}
          </tr>
        </thead>

        <tbody>${rows}</tbody>

      </table>

    </div>

    ${
      r.showSummary
      ? `
        <div class="report__summary">
          <div class="report__stat"><span>${esc(r.stat1)}</span><b>${ranked.length}</b></div>
          <div class="report__stat"><span>${esc(r.stat2)}</span><b>${avg} من ${maxWeek}</b></div>
          <div class="report__stat"><span>${esc(r.stat3)}</span><b>${bm?esc(bm.names.join('، '))+' — '+bm.total:'—'}</b></div>
          <div class="report__stat"><span>${esc(r.stat4)}</span><b>${bf?esc(bf.names.join('، '))+' — '+bf.total:'—'}</b></div>
        </div>
      `
      : ''
    }

    ${
      notes
      ? `
        <div class="report__notes">
          <h4>${esc(r.notesTitle)}</h4>
          <p>${esc(notes).replace(/\n/g,'<br>')}</p>
        </div>
      `
      : ''
    }

    <div class="report__foot">
      ${sig(r.showPrep,r.prepLabel,r.prepName)}
      ${sig(r.showApprove,r.approveLabel,r.approveName)}
    </div>

  </div>
  `;
}

const EV_REPORT_SCHEMA = [
  { title:'الترويسة', open:true, fields:[
    {k:'title',label:'عنوان التقرير'},
    {k:'subtitle',label:'العنوان الفرعي'},
    {k:'showLogoProgram',label:'إظهار شعار «تعلّم العربية»',type:'check'},
    {k:'logoProgram',label:'شعار «تعلّم العربية»',type:'logo',fallback:EV_LOGO_PROGRAM},
    {k:'showLogoOrg',label:'إظهار شعار «السقيفة»',type:'check'},
    {k:'logoOrg',label:'شعار «السقيفة»',type:'logo',fallback:EV_LOGO_ORG}
  ]},
  { title:'بيانات التقرير (الدورة / الأسبوع / التاريخ)', fields:[
    {k:'showMeta',label:'إظهار هذا الشريط',type:'check'},
    {k:'courseLabel',label:'عنوان خانة الدورة'},
    {k:'weekLabel',label:'عنوان خانة الأسبوع'},
    {k:'dateLabel',label:'عنوان خانة التاريخ'},
    {k:'dateText',label:'التاريخ (اتركه فارغًا ليُكتب تاريخ اليوم تلقائيًا)'}
  ]},
  { title:'المقدمة والمخاطبة', fields:[
    {k:'showIntro',label:'إظهار المقدمة',type:'check'},
    {k:'toName',label:'سطر المخاطبة'},
    {k:'intro',label:'نص المقدمة — يمكنك استخدام {الأسبوع} و{الدورة} و{عدد الأسابيع}',type:'area',rows:5}
  ]},
  { title:'عناوين أعمدة الجدول', fields:[
    {k:'colIndex',label:'عمود الرقم'},
    {k:'colName',label:'عمود الاسم'},
    {k:'showGender',label:'إظهار عمود الفئة',type:'check'},
    {k:'colGender',label:'عنوان عمود الفئة'},
    {k:'genderM',label:'كلمة (معلّم)'},
    {k:'genderF',label:'كلمة (معلّمة)'},
    {k:'colTotal',label:'عمود المجموع'},
    {k:'showPercent',label:'إظهار عمود النسبة',type:'check'},
    {k:'colPercent',label:'عنوان عمود النسبة'},
    {k:'showRank',label:'إظهار عمود الترتيب',type:'check'},
    {k:'colRank',label:'عنوان عمود الترتيب'}
  ]},
  { title:'مربعات الملخص', fields:[
    {k:'showSummary',label:'إظهار مربعات الملخص',type:'check'},
    {k:'stat1',label:'المربع الأول'},
    {k:'stat2',label:'المربع الثاني'},
    {k:'stat3',label:'المربع الثالث'},
    {k:'stat4',label:'المربع الرابع'}
  ]},
  { title:'الملاحظات والتوصيات', open:true, fields:[
    {k:'notesTitle',label:'عنوان قسم الملاحظات'},
    {type:'notes'}
  ]},
  { title:'التوقيعات', fields:[
    {k:'showPrep',label:'إظهار خانة الإعداد',type:'check'},
    {k:'prepLabel',label:'عنوان خانة الإعداد'},
    {k:'prepName',label:'اسم المُعِدّ (اختياري)'},
    {k:'showApprove',label:'إظهار خانة الاعتماد',type:'check'},
    {k:'approveLabel',label:'عنوان خانة الاعتماد'},
    {k:'approveName',label:'اسم المعتمِد'}
  ]}
];

function evReportFieldHTML(f,r){

  if(f.type==='notes'){

    return `
      <label class="field">
        <span id="evRepNotesLabel">ملاحظات الأسبوع ${evReportWeek} (تظهر في التقرير إذا لم تكن فارغة)</span>
        <textarea
          id="evRepNotes"
          class="input"
          rows="5"
          placeholder="اكتب هنا أي ملاحظات أو توصيات للمدير عن هذا الأسبوع…"
          oninput="evRepNotes(this.value)">${esc((DATA.evalSettings.reportNotes||{})[evReportWeek]||'')}</textarea>
      </label>
    `;
  }

  const v=r[f.k];

  if(f.type==='check'){

    return `
      <label class="check">
        <input
          type="checkbox"
          ${v?'checked':''}
          onchange="evRepInput('${f.k}',this)">
        ${f.label}
      </label>
    `;
  }

  if(f.type==='area'){

    return `
      <label class="field">
        <span>${f.label}</span>
        <textarea
          class="input"
          rows="${f.rows||3}"
          oninput="evRepInput('${f.k}',this)">${esc(v)}</textarea>
      </label>
    `;
  }

  if(f.type==='logo'){

    return `
      <div class="field">
        <span>${f.label}</span>
        <div class="logo-row">
          <img class="logo-thumb" src="${esc(v||f.fallback)}" alt="">
          <label class="btn ghost small" style="cursor:pointer;">
            رفع شعار بديل
            <input
              type="file"
              accept="image/*"
              hidden
              onchange="evRepLogo('${f.k}',this)">
          </label>
          <button
            type="button"
            class="btn danger small"
            onclick="evRepLogoReset('${f.k}')">
            الشعار الأصلي
          </button>
        </div>
      </div>
    `;
  }

  return `
    <label class="field">
      <span>${f.label}</span>
      <input
        type="text"
        class="input"
        value="${esc(v)}"
        oninput="evRepInput('${f.k}',this)">
    </label>
  `;
}

function renderEvReport(){

  const weeks=evCourseWeeks();

  if(evReportWeek<1 || evReportWeek>weeks){
    evReportWeek=1;
  }

  const r=evReport();

  return `

    <div class="toolbar">

      <select
        class="input"
        style="width:auto;"
        onchange="evReportWeek=Number(this.value);evRefreshReport();evSyncNotes()">

        ${Array.from({length:weeks},(_,i)=>i+1).map(w=>`
          <option
            value="${w}"
            ${evReportWeek===w?'selected':''}>
            الأسبوع ${w}
          </option>
        `).join('')}

      </select>

      <button
        class="btn ghost small"
        onclick="evToggleReportEditor()">
        ${icon('edit')} تعديل التقرير
      </button>

      <button
        class="btn primary small"
        onclick="evPrintReport()">
        ${icon('printer')} طباعة / حفظ PDF
      </button>

      <button
        class="btn secondary small"
        onclick="evSendReportToCeo()">
        ${icon('send')} إرسال لمدير الأكاديمية
      </button>

    </div>

    <div class="notice">
      عدّل أي نص أو عنوان في التقرير (حتى الترويسة) من زر «تعديل التقرير»،
      ثم احفظه PDF لإرساله للمدير.
    </div>

    ${renderEvSentList()}

    <aside class="side-editor ${evReportEditorOpen?'open':''}">

      <div class="side-editor__head">

        <h3>${icon('edit')} تعديل التقرير</h3>

        <button
          class="week-arrow"
          onclick="evToggleReportEditor(false)"
          title="إغلاق">${icon('x',13)}</button>

      </div>

      <div class="side-editor__fields">

        ${EV_REPORT_SCHEMA.map(g=>`
          <details class="ed-group" ${g.open?'open':''}>
            <summary>${g.title}</summary>
            <div class="ed-body">
              ${g.fields.map(f=>evReportFieldHTML(f,r)).join('')}
            </div>
          </details>
        `).join('')}

      </div>

      <div class="side-editor__foot">

        <button
          class="btn ghost small"
          onclick="evResetReport()">
          ${icon('refresh')} استرجاع الأصل
        </button>

        <button
          class="btn primary small"
          onclick="evToggleReportEditor(false)">
          تم
        </button>

      </div>

    </aside>

    <div id="evReportWrap">
      ${evReportHTML(evReportWeek)}
    </div>
  `;
}

function evRefreshReport(){

  const w=$('evReportWrap');

  if(w){
    w.innerHTML=evReportHTML(evReportWeek);
  }
}

function evSyncNotes(){

  const ta=$('evRepNotes');

  if(!ta) return;

  ta.value=
    (DATA.evalSettings.reportNotes||{})[evReportWeek]||'';

  const lb=$('evRepNotesLabel');

  if(lb){
    lb.textContent=
      `ملاحظات الأسبوع ${evReportWeek} (تظهر في التقرير إذا لم تكن فارغة)`;
  }
}

function evToggleReportEditor(force){

  evReportEditorOpen=
    typeof force==='boolean'?force:!evReportEditorOpen;

  renderAdmin();
}

function evRepInput(k,el){

  DATA.evalSettings.report={
    ...(DATA.evalSettings.report||{}),
    [k]:el.type==='checkbox'?el.checked:el.value
  };

  evQueueSave('report');

  evRefreshReport();
}

function evRepNotes(value){

  DATA.evalSettings.reportNotes={
    ...(DATA.evalSettings.reportNotes||{}),
    [evReportWeek]:value
  };

  evQueueSave('report_notes');

  evRefreshReport();
}

function evRepLogo(key,input){

  const file=input.files[0];

  if(!file) return;

  const reader=new FileReader();

  reader.onload=()=>{

    const img=new Image();

    img.onload=()=>{

      const ratio=Math.min(1,400/Math.max(img.width,img.height));

      const cv=document.createElement('canvas');

      cv.width=Math.round(img.width*ratio);
      cv.height=Math.round(img.height*ratio);

      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);

      DATA.evalSettings.report={
        ...(DATA.evalSettings.report||{}),
        [key]:cv.toDataURL('image/png')
      };

      evQueueSave('report');

      renderAdmin();

      toast('تم تحديث الشعار');
    };

    img.src=reader.result;
  };

  reader.readAsDataURL(file);
}

function evRepLogoReset(key){

  DATA.evalSettings.report={
    ...(DATA.evalSettings.report||{}),
    [key]:''
  };

  evQueueSave('report');

  renderAdmin();

  toast('تمت إعادة الشعار الأصلي');
}

function evResetReport(){

  if(!confirm(
    'استرجاع الصياغة الأصلية للتقرير؟ (ملاحظات الأسابيع تبقى كما هي)'
  )){
    return;
  }

  DATA.evalSettings.report=null;

  evQueueSave('report');

  renderAdmin();

  toast('تم استرجاع الصياغة الأصلية');
}

function evPrintReport(){

  evPrint(
    'report',
    `التقرير الأسبوعي - الأسبوع ${evReportWeek} - ${evCourseName()}`,
    evReportHTML(evReportWeek)
  );
}

/* ---------- 4) الشهادات ---------- */

const EV_DEFAULT_CERT = {
  title:'شهادة شكر وتقدير',
  lead:'تتقدّم إدارة برنامج «تعلّم العربية» التابع لـ«السقيفة»\nبجزيل الشكر وخالص التقدير والامتنان إلى',
  titleM:'الأستاذ',
  titleF:'الأستاذة',
  bodyM:'وذلك تقديرًا لجهوده المتميّزة وعطائه المخلص، وتفوّق أدائه التعليمي والتزامه وابتكاره خلال «{الدورة}»، حيث نال المركز الأول كأفضل معلم بمجموع {النقاط} نقطة.\nسائلين المولى عزّ وجلّ له دوام التوفيق والسداد، وأن يجعل ذلك في ميزان حسناته.',
  bodyF:'وذلك تقديرًا لجهودها المتميّزة وعطائها المخلص، وتفوّق أدائها التعليمي والتزامها وابتكارها خلال «{الدورة}»، حيث نالت المركز الأول كأفضل معلمة بمجموع {النقاط} نقطة.\nسائلين المولى عزّ وجلّ لها دوام التوفيق والسداد، وأن يجعل ذلك في ميزان حسناتها.',
  signTitle:'مدير الأكاديمية',
  signName:'د. بدر هديبان الحربي',
  dateLabel:'التاريخ',
  dateText:''
};

const EV_CERT_FIELDS = [
  {k:'title',label:'عنوان الشهادة'},
  {k:'signTitle',label:'المسمى الوظيفي للموقّع'},
  {k:'signName',label:'اسم الموقّع'},
  {k:'titleM',label:'اللقب (للمعلم)'},
  {k:'titleF',label:'اللقب (للمعلمة)'},
  {k:'dateLabel',label:'عنوان خانة التاريخ'},
  {k:'dateText',label:'التاريخ (فارغ = تاريخ اليوم تلقائيًا)'},
  {k:'lead',label:'المقدمة (قبل الاسم)',type:'area',rows:2},
  {k:'bodyM',label:'نص التقدير — للمعلم',type:'area',rows:4},
  {k:'bodyF',label:'نص التقدير — للمعلمة',type:'area',rows:4}
];

function evCert(){

  return Object.assign(
    {},
    EV_DEFAULT_CERT,
    DATA.evalSettings.cert||{}
  );
}

function evCertHTML(teacher){

  const isF=teacher.gender==='f';
  const c=evCert();
  const total=evCumulative(teacher.id);
  const vars={course:evCourseName(),total};
  const {hijri,greg}=evTodayStrings();

  return `

  <div class="cert" id="certificate">

    <div class="cert__frame">

      <div class="cert__logos">
        <img src="${EV_LOGO_PROGRAM}" alt="" class="cert__logo cert__logo--program">
        <img src="${EV_LOGO_ORG}" alt="" class="cert__logo cert__logo--org">
      </div>

      <div class="cert__ornament"><span></span><i></i><span></span></div>

      <h1 class="cert__title">${esc(c.title)}</h1>

      <p class="cert__lead">${evFmt(c.lead,vars)}</p>

      <div class="cert__name">${esc(isF?c.titleF:c.titleM)} / ${esc(teacher.name)}</div>

      <p class="cert__body">${evFmt(isF?c.bodyF:c.bodyM,vars)}</p>

      <div class="cert__footer">

        <div class="cert__date">
          <span>${esc(c.dateLabel)}</span>
          ${
            c.dateText
            ? `<b>${esc(c.dateText)}</b>`
            : `<b>${hijri} هـ</b><small>الموافق ${greg} م</small>`
          }
        </div>

        <div class="cert__sign">
          <span>${esc(c.signTitle)}</span>
          <div class="cert__sign-line"></div>
          <b>${esc(c.signName)}</b>
        </div>

      </div>

    </div>

  </div>
  `;
}

function evCertTeacher(){

  return DATA.teachers.find(t=>t.id===evCertTeacherId) ||
    evRanked().find(x=>x.t.gender==='m' && x.total>0)?.t ||
    DATA.teachers[0];
}

function renderEvCert(){

  const ranked=evRanked();

  const bestM=ranked.find(x=>x.t.gender==='m' && x.total>0);
  const bestF=ranked.find(x=>x.t.gender==='f' && x.total>0);

  const teacher=evCertTeacher();

  const c=evCert();

  return `

    <div class="toolbar">

      <select
        class="input"
        style="width:auto;max-width:280px;"
        onchange="evCertTeacherId=this.value;evRefreshCert()">

        ${
          bestM
          ? `<option value="${bestM.t.id}" ${teacher.id===bestM.t.id?'selected':''}>أفضل معلم: ${esc(bestM.t.name)}</option>`
          : ''
        }

        ${
          bestF
          ? `<option value="${bestF.t.id}">أفضل معلمة: ${esc(bestF.t.name)}</option>`
          : ''
        }

        <optgroup label="بقية المعلمين والمعلمات">
          ${DATA.teachers.map(t=>`
            <option
              value="${t.id}"
              ${teacher.id===t.id && !bestM?'selected':''}>
              ${esc(t.name)}${t.gender?` (${t.gender==='f'?'معلمة':'معلم'})`:''}
            </option>
          `).join('')}
        </optgroup>

      </select>

      <button
        class="btn ghost small"
        onclick="evCertEditorOpen=!evCertEditorOpen;renderAdmin()">
        ${icon('edit')} تعديل صياغة الشهادة
      </button>

      <button
        class="btn primary small"
        onclick="evPrintCert()">
        ${icon('printer')} طباعة / حفظ PDF
      </button>

    </div>

    ${
      evCertEditorOpen
      ? `
        <div class="cert-editor open">

          <div class="cert-editor__head">
            <h3>${icon('edit')} تعديل صياغة الشهادة</h3>
            <span class="muted small">التعديلات تُحفظ تلقائيًا وتظهر في الشهادة مباشرة</span>
          </div>

          <p class="cert-editor__hint">
            تقدر تستخدم داخل النص: <code>{الدورة}</code> لاسم الدورة،
            و<code>{النقاط}</code> لمجموع النقاط.
          </p>

          <div class="form-grid">

            ${EV_CERT_FIELDS.map(f=>`

              <label class="field" ${f.type==='area'?'style="grid-column:1/-1;"':''}>

                <span class="modal-label">${f.label}</span>

                ${
                  f.type==='area'
                  ? `<textarea class="input" rows="${f.rows||3}" oninput="evCertInput('${f.k}',this.value)">${esc(c[f.k])}</textarea>`
                  : `<input class="input" value="${esc(c[f.k])}" oninput="evCertInput('${f.k}',this.value)">`
                }

              </label>

            `).join('')}

          </div>

          <div class="toolbar" style="margin-bottom:0;">

            <button
              class="btn ghost small"
              onclick="evResetCert()">
              ${icon('refresh')} استرجاع الصياغة الأصلية
            </button>

            <button
              class="btn primary small"
              onclick="evCertEditorOpen=false;renderAdmin()">
              تم
            </button>

          </div>

        </div>
      `
      : ''
    }

    <div id="evCertWrap">
      ${evCertHTML(teacher)}
    </div>
  `;
}

function evRefreshCert(){

  const w=$('evCertWrap');

  if(w){
    w.innerHTML=evCertHTML(evCertTeacher());
  }
}

function evCertInput(k,v){

  DATA.evalSettings.cert={
    ...(DATA.evalSettings.cert||{}),
    [k]:v
  };

  evQueueSave('cert');

  evRefreshCert();
}

function evResetCert(){

  if(!confirm('استرجاع الصياغة الأصلية للشهادة؟')) return;

  DATA.evalSettings.cert=null;

  evQueueSave('cert');

  renderAdmin();

  toast('تم استرجاع الصياغة الأصلية');
}

function evPrintCert(){

  const t=evCertTeacher();

  evPrint(
    'cert',
    'شهادة شكر وتقدير - '+(t?t.name:''),
    evCertHTML(t)
  );
}

/* ---------- 5) الخصومات ---------- */

function renderEvDeductions(){

  if(!evDeductTeacher || !getTeacher(evDeductTeacher)){
    evDeductTeacher=DATA.teachers[0]?.id||'';
  }

  return `

    <div class="toolbar">

      <select
        class="input"
        style="width:auto;"
        onchange="evDeductTeacher=this.value;renderAdmin()">

        ${DATA.teachers.map(t=>`
          <option
            value="${t.id}"
            ${evDeductTeacher===t.id?'selected':''}>
            ${esc(t.name)}
          </option>
        `).join('')}

      </select>

    </div>

    <div class="toolbar">
      <button class="btn ghost small" onclick="exportDeductionsExcel()">${icon('download')} تصدير كل الخصومات Excel</button>
    </div>

    ${renderTeacherDeductions(evDeductTeacher)}
  `;
}

/* ---------- استيراد من Excel (المنصة القديمة) ---------- */

function evImportExcel(input){

  const file=input.files[0];

  input.value='';

  if(!file) return;

  const reader=new FileReader();

  reader.onload=async evt=>{

    try{

      const wb=XLSX.read(evt.target.result,{type:'binary'});

      await evImportWorkbook(wb);

    }catch(err){

      console.error(err);

      toast(
        'تعذّر قراءة الملف، تأكد أنه ملف التصدير من المنصة القديمة.',
        true
      );
    }
  };

  reader.readAsBinaryString(file);
}

async function evImportWorkbook(wb){

  const sheet=name=>
    wb.SheetNames.includes(name)
      ? XLSX.utils.sheet_to_json(wb.Sheets[name])
      : [];

  const summary=sheet('ملخص المعلمين');

  const weekSheets=
    wb.SheetNames
      .map(n=>({n,m:n.match(/^الأسبوع (\d+)$/)}))
      .filter(x=>x.m)
      .map(x=>({name:x.n,week:Number(x.m[1])}));

  if(!summary.length && !weekSheets.length){

    toast('لم أجد بيانات المعلمين في هذا الملف.',true);
    return;
  }

  if(!confirm(
    `استيراد ${summary.length} معلم/ة و${weekSheets.length} أسبوع؟\n`+
    'المعلمون الموجودون بنفس الاسم يُحدَّثون ولا يتكررون، '+
    'ودرجات الأسابيع المستوردة تحلّ محل الدرجات الحالية لنفس الأسبوع.'
  )){
    return;
  }

  const genderOf=v=>
    String(v||'').includes('معلّمة')||String(v||'').includes('معلمة')?'f':'m';

  const byName=()=>
    Object.fromEntries(DATA.teachers.map(t=>[t.name,t]));

  try{

    // 1) المعلمون
    const names=[];

    summary.forEach(r=>{

      const name=String(r['الاسم']||'').trim();

      if(name) names.push({name,gender:genderOf(r['الفئة'])});
    });

    weekSheets.forEach(ws=>{

      XLSX.utils.sheet_to_json(wb.Sheets[ws.name]).forEach(r=>{

        const name=String(r['الاسم']||'').trim();

        if(name && !names.some(x=>x.name===name)){
          names.push({name,gender:genderOf(r['الفئة'])});
        }
      });
    });

    const existing=byName();

    const toInsert=
      names
        .filter(x=>!existing[x.name])
        .map(x=>({
          name:x.name,
          phone:'',
          gender:x.gender,
          login_code:genTeacherCode()
        }));

    if(toInsert.length){

      const inserted=await sb(
        db().from('teachers').insert(toInsert).select()
      );

      (inserted||[]).forEach(r=>DATA.teachers.push(mapTeacher(r)));
    }

    for(const x of names){

      const t=byName()[x.name];

      if(t && t.gender!==x.gender){

        const row=await updateRow('teachers',t.id,{gender:x.gender});

        Object.assign(t,mapTeacher(row));
      }
    }

    // 2) الدورة والمعايير
    const info=sheet('بيانات الدورة')[0];

    if(info){

      DATA.evalSettings.course={
        name:info['اسم الدورة']||evCourseName(),
        weeks:Number(info['مدة الدورة (أسابيع)'])||evCourseWeeks()
      };

      evQueueSave('course');
    }

    const critRows=sheet('المعايير');

    if(critRows.length){

      DATA.evalSettings.criteria=critRows.map((r,i)=>({
        key:String(r['المعرّف']||('c_'+i)),
        label:String(r['المعيار']||'معيار'),
        max:Number(r['الدرجة القصوى'])||10
      }));

      evQueueSave('criteria');
    }

    // 3) الدرجات
    const crit=evCriteria();

    const rows=[];

    weekSheets.forEach(ws=>{

      XLSX.utils.sheet_to_json(wb.Sheets[ws.name]).forEach(r=>{

        const t=byName()[String(r['الاسم']||'').trim()];

        if(!t) return;

        const scores={};

        crit.forEach(c=>{
          scores[c.key]=Number(r[c.label])||0;
        });

        rows.push({
          teacher_id:t.id,
          week:ws.week,
          scores,
          updated_at:new Date().toISOString()
        });
      });
    });

    if(rows.length){

      await sb(
        db()
        .from('teacher_scores')
        .upsert(rows,{onConflict:'teacher_id,week'})
      );
    }

    await loadData();

    evDraft={};

    evWeek=1;

    toast(
      `تم الاستيراد: ${names.length} معلم/ة، ${weekSheets.length} أسبوع.`
    );

    renderAdmin();

  }catch(x){

    toast(
      'تعذّر الاستيراد — تأكد من تشغيل v3_setup.sql. '+friendlyError(x),
      true
    );
  }
}


/* =========================================================
   الطلاب
   ========================================================= */

function renderAdminStudents(){

  return panel(
    'الطلاب',

    `
    <form
      onsubmit="addStudent(event)"
      class="form-grid">

      <input
        id="studentName"
        class="input"
        placeholder="اسم الطالب"
        required>

      <input
        id="studentPhone"
        class="input"
        placeholder="رقم الجوال">

      <select
        id="studentRoom"
        class="input">

        <option value="">
          بدون قاعة
        </option>

        ${DATA.rooms.map(r=>`

          <option value="${r.id}">
            ${esc(r.name)}
          </option>

        `).join('')}

      </select>

      <button
        class="btn primary">

        إضافة طالب

      </button>

    </form>

    <hr>

    <div class="notice">

      إضافة عدة طلاب دفعة واحدة: اكتب اسم كل
      طالب في سطر مستقل، ويمكنك إضافة رقم
      الجوال بعد فاصلة (اختياري). مثال:
      <br>أحمد الشمري, 0555555555
      <br>خالد العتيبي

    </div>

    <form
      onsubmit="addStudentsBulk(event)"
      class="form-grid">

      <textarea
        id="bulkStudentsText"
        class="input"
        rows="6"
        placeholder="اسم الطالب, رقم الجوال (اختياري)"
        required></textarea>

      <select
        id="bulkStudentRoom"
        class="input">

        <option value="">
          بدون قاعة
        </option>

        ${DATA.rooms.map(r=>`

          <option value="${r.id}">
            ${esc(r.name)}
          </option>

        `).join('')}

      </select>

      <button
        class="btn secondary">

        إضافة القائمة

      </button>

    </form>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>الطالب</th>
            <th>الجوال</th>
            <th>القاعة</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${DATA.students.map(s=>{

            return `

              <tr>

                <td>
                  ${esc(s.name)}
                </td>

                <td>
                  ${esc(s.phone)}
                </td>

                <td>
                  ${esc(
                    getRoom(s.roomId)?.name||'-'
                  )}
                </td>

                <td>

                  <button class="btn ghost small" onclick="editStudent('${s.id}')">تعديل</button>
<button
                    class="btn danger small"
                    onclick="deleteStudent('${s.id}')">

                    حذف

                  </button>

                </td>

              </tr>

            `;

          }).join('')}

        </tbody>

      </table>

    </div>
    `
  );
}

async function addStudent(e){

  e.preventDefault();

  try{

    const row=await sb(

      db()
      .from('students')
      .insert({

        name:
          $('studentName').value.trim(),

        phone:
          $('studentPhone').value.trim(),

        room_id:
          $('studentRoom').value||null

      })
      .select()
      .single()

    );

    DATA.students.push(
      mapStudent(row)
    );

    sortStudents();

    toast('تمت إضافة الطالب');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

function sortStudents(){

  DATA.students.sort((a,b)=>
    a.name.localeCompare(b.name,'ar')
  );
}

async function addStudentsBulk(e){

  e.preventDefault();

  try{

    const raw=
      $('bulkStudentsText').value;

    const roomId=
      $('bulkStudentRoom').value||null;

    const lines=raw
      .split('\n')
      .map(l=>l.trim())
      .filter(l=>l.length);

    if(!lines.length){

      toast(
        'أدخل اسمًا واحدًا على الأقل.',
        true
      );

      return;
    }

    const payload=lines.map(line=>{

      const [namePart,phonePart]=
        line.split(',');

      return {
        name:(namePart||'').trim(),
        phone:(phonePart||'').trim(),
        room_id:roomId
      };

    }).filter(s=>s.name);

    if(!payload.length){

      toast(
        'لم يتم العثور على أسماء صالحة.',
        true
      );

      return;
    }

    const rows=await sb(

      db()
      .from('students')
      .insert(payload)
      .select()

    );

    (rows||[]).forEach(r=>{
      DATA.students.push(mapStudent(r));
    });

    sortStudents();

    $('bulkStudentsText').value='';

    toast(
      `تمت إضافة ${(rows||[]).length} طالب/طالبة`
    );

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

async function deleteStudent(id){

  if(!confirm('حذف الطالب؟')){
    return;
  }

  try{

    await sb(
      db()
      .from('students')
      .delete()
      .eq('id',id)
    );

    DATA.students=
      DATA.students.filter(
        s=>s.id!==id
      );

    DATA.evaluations=
      DATA.evaluations.filter(
        e=>e.studentId!==id
      );

    toast('تم حذف الطالب');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

function renderAdminEvals(){

  const ranked=getBestStudents();

  const rankedIds=
    new Set(ranked.map(x=>x.student.id));

  const unevaluated=
    DATA.students.filter(
      s=>!rankedIds.has(s.id)
    );

  return panel(
    'تقييم الطلاب',

    `
    <div class="notice">

      الترتيب تلقائي بناءً على متوسط تقييمات
      المعلم للطالب عبر كل أسابيع الدورة.

    </div>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>#</th>
            <th>الطالب</th>
            <th>القاعة</th>
            <th>المعلم</th>
            <th>عدد الأسابيع المقيَّمة</th>
            <th>المتوسط العام</th>

          </tr>

        </thead>

        <tbody>

          ${ranked.map((x,i)=>{

            const r=getRoom(x.student.roomId);

            const weeksCount=
              DATA.evaluations.filter(
                e=>e.studentId===x.student.id
              ).length;

            return `

              <tr>

                <td>${i+1}</td>

                <td>
                  ${esc(x.student.name)}
                </td>

                <td>
                  ${esc(r?.name||'-')}
                </td>

                <td>
                  ${esc(
                    getTeacher(r?.teacherId)?.name||'-'
                  )}
                </td>

                <td>
                  ${weeksCount}
                </td>

                <td>
                  <b class="${scoreClass(x.average)}">
                    ${x.average}%
                  </b>
                </td>

              </tr>

            `;

          }).join('')}

          ${unevaluated.map(s=>{

            const r=getRoom(s.roomId);

            return `

              <tr>

                <td>-</td>

                <td>
                  ${esc(s.name)}
                </td>

                <td>
                  ${esc(r?.name||'-')}
                </td>

                <td>
                  ${esc(
                    getTeacher(r?.teacherId)?.name||'-'
                  )}
                </td>

                <td>0</td>

                <td>غير مقيَّم</td>

              </tr>

            `;

          }).join('')}

        </tbody>

      </table>

    </div>
    `
  );
}
/* =========================================================
   التقارير الأسبوعية - الإدارة
   ========================================================= */

function renderAdminReports(){

  return panel(
    'التقارير الأسبوعية',

    `
    <div class="stats-grid">

      <div class="stat-card">
        <strong>${DATA.reports.length}</strong>
        <span>إجمالي التقارير</span>
      </div>

      <div class="stat-card">
        <strong>${DATA.teachers.length}</strong>
        <span>المعلمون</span>
      </div>

      <div class="stat-card">
        <strong>${DATA.rooms.length}</strong>
        <span>القاعات</span>
      </div>

    </div>

    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>المعلم</th>
            <th>القاعة</th>
            <th>الأسبوع</th>
            <th>التاريخ</th>
            <th>التقرير</th>
            <th>الصور</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${
            DATA.reports.length
            ? DATA.reports.map(r=>`

              <tr>

                <td>
                  ${esc(
                    getTeacher(r.teacherId)?.name||'-'
                  )}
                </td>

                <td>
                  ${esc(
                    getRoom(r.roomId)?.name||'-'
                  )}
                </td>

                <td>
                  ${esc(r.week||'-')}
                </td>

                <td>
                  ${fmtDate(r.date)}
                </td>

                <td>
                  <div style="white-space:pre-wrap">
                    ${esc(r.content||'-')}
                  </div>

                  ${
                    r.driveLink
                    ? `
                      <a
                        href="${esc(r.driveLink)}"
                        target="_blank"
                        rel="noopener"
                        class="link">
                        فتح رابط Google Drive
                      </a>
                    `
                    :''
                  }
                </td>

                <td>
                  ${
                    r.images?.length
                    ? `
                      <div class="report-images">

                        ${r.images.map(img=>`

                          <a
                            href="${img}"
                            target="_blank"
                            rel="noopener">

                            <img
                              src="${img}"
                              alt="صورة التقرير"
                              loading="lazy">

                          </a>

                        `).join('')}

                      </div>
                    `
                    : '-'
                  }
                </td>

                <td>

                  <button
                    class="btn ${r.sentToCeo?'ghost':'secondary'} small"
                    onclick="toggleReportCeo('${r.id}')">
                    ${r.sentToCeo?icon('check')+' مُرسل لمدير الأكاديمية — إلغاء':icon('send')+' إرسال لمدير الأكاديمية'}
                  </button>
                  <button class="btn ghost small" onclick="editReport('${r.id}')">تعديل</button>
<button
                    class="btn danger small"
                    onclick="deleteReport('${r.id}')">
                    حذف
                  </button>

                </td>

              </tr>

            `).join('')
            : `
              <tr>
                <td colspan="7">
                  لا توجد تقارير حتى الآن.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
    `
  );
}

async function deleteReport(id){

  if(!confirm('هل تريد حذف التقرير؟')){
    return;
  }

  try{

    await sb(
      db()
      .from('reports')
      .delete()
      .eq('id',id)
    );

    DATA.reports=
      DATA.reports.filter(
        r=>r.id!==id
      );

    toast('تم حذف التقرير');

    renderAdmin();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   الإعلانات - الإدارة
   ========================================================= */

function renderAdminAnnouncements(){

  return panel(
    'الإعلانات',

    `
    <form
      onsubmit="addAnnouncement(event)"
      class="form-grid">

      <textarea
        id="announcementText"
        class="input"
        rows="4"
        placeholder="اكتب الإعلان هنا..."
        required></textarea>

      <button
        class="btn primary">
        نشر الإعلان
      </button>

    </form>

    <div class="announcement-list">

      ${
        DATA.announcements.length
        ? DATA.announcements.map(a=>`

          <div class="announcement-card">

            <div class="announcement-date">
              ${fmtDate(a.date)}
            </div>

            <div class="announcement-text">
              ${esc(a.text)}
            </div>

            <button class="btn ghost small" onclick="editAnnouncement('${a.id}')">تعديل</button>
<button
              class="btn danger small"
              onclick="deleteAnnouncement('${a.id}')">
              حذف
            </button>

          </div>

        `).join('')
        : `
          <div class="empty">
            لا توجد إعلانات.
          </div>
        `
      }

    </div>
    `
  );
}

async function addAnnouncement(e){

  e.preventDefault();

  const message=
    $('announcementText')?.value.trim();

  if(!message){
    toast('اكتب نص الإعلان أولاً',true);
    return;
  }

  try{

    const row=await sb(

      db()
      .from('announcements')
      .insert({
        message,
        created_by:currentUser.id
      })
      .select()
      .single()

    );

    DATA.announcements.unshift(
      mapAnnouncement(row)
    );

    toast('تم نشر الإعلان');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

async function deleteAnnouncement(id){

  if(!confirm('حذف الإعلان؟')){
    return;
  }

  try{

    await sb(
      db()
      .from('announcements')
      .delete()
      .eq('id',id)
    );

    DATA.announcements=
      DATA.announcements.filter(
        x=>x.id!==id
      );

    toast('تم حذف الإعلان');

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

/* =========================================================
   الطالب المتميز
   ========================================================= */

function renderAdminChampion(){

  return panel(
    'الطلاب المتميزون',

    `
    <div class="notice">

      يتحدد ترتيب كل طالب تلقائيًا حسب متوسط
      تقييمات المعلم له خلال أسابيع الدورة —
      الشريط الأخضر الكامل يعني تميّزًا مرتفعًا،
      الأخضر الفاتح يعني تميّزًا جيدًا، والأحمر
      يعني تقييمًا مقبولًا أو ضعيفًا.

    </div>

    ${DATA.rooms.map(room=>{

      const ranked=
        getBestStudents(room.id);

      const unranked=
        DATA.students.filter(
          s=>s.roomId===room.id &&
             !ranked.some(x=>x.student.id===s.id)
        );

      return `

        <div class="dashboard-highlight">

          <h3>${esc(room.name)}</h3>

          ${
            ranked.length
            ? ranked.map(x=>`

              <div class="progress-row">

                <span class="progress-label">
                  ${esc(x.student.name)}
                </span>

                ${progressBarHtml(x.average)}

                <span class="progress-pct">
                  ${x.average}%
                </span>

              </div>

            `).join('')
            : ''
          }

          ${
            unranked.length
            ? unranked.map(s=>`

              <div class="progress-row">

                <span class="progress-label">
                  ${esc(s.name)}
                </span>

                ${progressBarHtml(0)}

                <span class="progress-pct">
                  -
                </span>

              </div>

            `).join('')
            : ''
          }

          ${
            !ranked.length && !unranked.length
            ? `
              <div class="empty">
                لا يوجد طلاب في هذه القاعة.
              </div>
            `
            : ''
          }

          ${
            ranked[0]
            ? `
              <div class="champion-result">
                ${icon('trophy')} الطالب المتميز:
                ${esc(ranked[0].student.name)}
                — ${ranked[0].average}%
              </div>
            `
            : ''
          }

        </div>

      `;

    }).join('')}
    `
  );
}

async function saveChampion(roomId){

  const studentId=
    $(`champion-${roomId}`)?.value;

  try{

    await sb(
      db()
      .from('champions')
      .delete()
      .eq('room_id',roomId)
    );

    if(studentId){

      await sb(
        db()
        .from('champions')
        .insert({
          room_id:roomId,
          student_id:studentId
        })
      );

      DATA.champions[roomId]=studentId;

    }else{

      delete DATA.champions[roomId];

    }

    toast('تم حفظ الطالب المتميز');

    renderAdmin();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   التصدير إلى Excel
   ========================================================= */

function renderAdminExport(){

  return panel(
    'التصدير',

    `
    <div class="export-box">

      <h3>
        تصدير بيانات المنصة
      </h3>

      <p>
        صدّر أي قسم إلى ملف Excel. (وفي كل قسم زر "تصدير Excel" بجانب عنوانه.)
      </p>

      <div class="export-buttons">

        <button class="btn primary" onclick="exportAllExcel()">${icon('chart')} تصدير جميع البيانات</button>
        <button class="btn secondary" onclick="exportRoomsExcel()">القاعات والدورات</button>
        <button class="btn secondary" onclick="exportTeachersListExcel()">المعلمون</button>
        <button class="btn secondary" onclick="exportTeachersExcel()">تقييم المعلمين</button>
        <button class="btn secondary" onclick="exportStudentsExcel()">الطلاب</button>
        <button class="btn secondary" onclick="exportReportsExcel()">التقارير الأسبوعية</button>
        <button class="btn secondary" onclick="exportAnnouncementsExcel()">الإعلانات</button>
        <button class="btn secondary" onclick="exportDeductionsExcel()">خصومات المعلمين</button>
        <button class="btn secondary" onclick="exportTasksExcel('all')">المهام والموظفون</button>
        <button class="btn secondary" onclick="openNarrativeModal()">${icon('file')} تقرير الدورة النصي</button>

      </div>

    </div>
    `
  );
}

/* ---------- تقرير الدورة النصي ---------- */

function openNarrativeModal(){

  if(!DATA.groups.length){

    toast('لا توجد مجموعات بعد.',true);
    return;
  }

  openEditModal({
    title:icon('file')+' تقرير الدورة النصي',
    fields:[
      {key:'groupId',label:'المجموعة',type:'select',
        value:DATA.groups[0].id,
        options:DATA.groups.map(g=>({value:g.id,label:g.name}))},
      {key:'reco',label:'التوصيات الختامية (كل توصية في سطر)',type:'textarea',
        value:'الاستمرار في متابعة تنفيذ المهام قبل انطلاق الدورة بوقت كافٍ.\nتعزيز التنسيق بين المعلمين والمشرف العام أثناء انعقاد الدورة.\nتوثيق الملاحظات أولًا بأول لرفعها في التقرير الختامي.'}
    ],
    onSave:async v=>{
      const built=buildNarrativeParas(v.groupId,v.reco);
      if(!built) return;
      setTimeout(()=>openEditModal({
        title:icon('edit')+' تحرير نص التقرير قبل التصدير',
        fields:[
          {key:'body',label:'نص التقرير (كل فقرة في سطر)',type:'textarea',rows:14,
            value:built.paras.join('\n')}
        ],
        saveLabel:icon('file')+' تصدير PDF',
        onSave:async v2=>{
          printNarrative(v.groupId,v.reco,v2.body);
        }
      }),0);
    }
  });
}

function buildNarrativeParas(groupId,reco){

  const g=getGroup(groupId);
  if(!g) return null;

  const gtasks=groupTasks(groupId);
  const AR_D='٠١٢٣٤٥٦٧٨٩';
  const toAr=n=>String(n).replace(/\d/g,d=>AR_D[+d]);
  const toEn=s=>String(s).replace(/[٠-٩]/g,d=>AR_D.indexOf(d));
  const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  const desc=g.description||'';
  const mNames=MONTHS.join('|');
  const dm=desc.match(new RegExp('([٠-٩\\d]+)(?:\\s*('+mNames+'))?\\s*[–-]\\s*([٠-٩\\d]+)\\s*('+mNames+')'));
  let dateSentence='';
  if(dm){
    const nowY=new Date().getFullYear();
    const nowM=new Date().getMonth()+1;
    const m1i=dm[2]?MONTHS.indexOf(dm[2])+1:MONTHS.indexOf(dm[4])+1;
    const m2i=MONTHS.indexOf(dm[4])+1;
    const y1=m1i<nowM?nowY+1:nowY;
    const y2=m2i<nowM?nowY+1:nowY;
    const d1=new Date(y1,m1i-1,Number(toEn(dm[1])));
    const d2=new Date(y2,m2i-1,Number(toEn(dm[3])));
    dateSentence=
      'انطلقت يوم '+DAYS[d1.getDay()]+' '+dm[1]+' '+(dm[2]||dm[4])+' '+toAr(d1.getFullYear())+'م'+
      '، واختتمت يوم '+DAYS[d2.getDay()]+' '+dm[3]+' '+dm[4]+' '+toAr(d2.getFullYear())+'م';
  }
  const studPart=(desc.split('·')[1]||'').trim();
  if(studPart) dateSentence+=(dateSentence?'، ':'')+'بمشاركة '+studPart+'.';
  else if(dateSentence) dateSentence+='.';

  const roomsByName={};
  DATA.rooms.filter(r=>r.groupName===g.name).forEach(r=>{
    (roomsByName[r.name]=roomsByName[r.name]||[]).push(r);
  });
  const roomNames=Object.keys(roomsByName);
  let teachersPara='';
  if(roomNames.length){
    const parts=roomNames.map(name=>{
      const ts=roomsByName[name]
        .map(r=>r.teacherId?getTeacher(r.teacherId):null)
        .filter(Boolean);
      if(!ts.length) return 'قاعة «'+name+'» (لم يُسنَد معلم بعد)';
      const female=ts.every(t=>t.gender==='f');
      const label=ts.length>1?(female?'المعلمتين':'المعلمين'):(female?'المعلمة':'المعلم');
      const names=ts.map(t=>t.name).join(ts.length>2?'، ':' و').replace(/، ([^،]+)$/,'، و$1');
      const total=roomsByName[name].reduce((a,r)=>a+DATA.students.filter(s=>s.roomId===r.id).length,0);
      return 'قاعة «'+name+'» بقيادة '+label+' '+names+(total?' وعدد طلابها '+toAr(total):'');
    });
    teachersPara='وأُسندت إدارة القاعات إلى نخبة من الكفاءات، فكانت '+parts.join('، و')+'.';
  }

  const phaseTitles=ph=>
    gtasks
      .filter(t=>taskPhase(t)===ph)
      .map(t=>t.title.replace(/^([123١-٣])\s*[·.]\s*[^—\-]+[—\-]\s*/,''))
      .filter(Boolean);

  const cleanItem=s=>String(s).replace(/[\s.:؛،]+$/,'');
  const joinAr=items=>
    items.length>1
    ? items.slice(0,-1).join('، ')+'، و'+items[items.length-1]
    : items[0];

  const prose=(intro,list)=>{
    list=list.map(cleanItem).filter(Boolean);
    if(!list.length) return '';
    if(list.length>6){
      const half=Math.ceil(list.length/2);
      return intro+joinAr(list.slice(0,half))+'. كما جرى '+joinAr(list.slice(half))+'.';
    }
    return intro+joinAr(list)+'.';
  };

  const prep=prose('وفي مرحلة الإعداد، جرى ',phaseTitles('قبل الدورة'));
  const during=prose('وخلال أيام الدورة، تابع فريق العمل ',phaseTitles('أثناء الدورة'));
  const closing=prose('وفي الختام، ',phaseTitles('بعد الدورة'));

  const notes=
    gtasks.map(t=>splitTaskDesc(t).adminNote).filter(Boolean);
  const notesPara=
    notes.length
    ? 'ومن أبرز ما وجّه إليه المشرف العام خلال سير العمل: '+joinAr(notes.map(cleanItem))+'.'
    : '';

  const doneCnt=gtasks.filter(t=>t.status==='done').length;
  const statsPara=
    gtasks.length
    ? 'هذا، وقد بلغ عدد مهام الدورة '+toAr(gtasks.length)+' مهمة، أُنجز منها '+toAr(doneCnt)+' بنسبة '+toAr(donePercent(gtasks))+'٪.'
    : '';

  const recoList=(reco||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const recoPara=
    recoList.length
    ? 'وفي الختام، نرفع بالتوصيات التالية: '+joinAr(recoList.map(cleanItem))+'.'
    : '';

  const paras=[
    'الحمد لله رب العالمين، وبعد: '+(dateSentence||('انعقدت دورة «'+g.name+'» ضمن برنامج تعلّم العربية.')),
    teachersPara, prep, during, closing, statsPara, notesPara, recoPara,
    'هذا والحمد لله الذي بنعمته تتم الصالحات.'
  ].filter(Boolean);

  return {g, paras};
}

function printNarrative(groupId,reco,customText){

  const built=buildNarrativeParas(groupId,reco);
  if(!built) return;
  const {g}=built;
  const paras=
    customText!=null
    ? String(customText).split(/\n+/).map(x=>x.trim()).filter(Boolean)
    : built.paras;

  const html=`
    <div class="report" dir="rtl" style="background:#fff;color:#111;padding:30px 34px;font-family:'Tajawal','Cairo',sans-serif;line-height:2.1;font-size:15px;">

      <div style="display:flex;justify-content:space-between;align-items:center;">
        <img src="assets/Arabic_logo.png" style="height:74px;" alt="">
        <img src="assets/logo-saqifah.png" style="height:74px;" alt="">
      </div>

      <p style="text-align:center;font-size:20px;font-weight:700;margin:16px 0 4px;">بسم الله الرحمن الرحيم</p>

      <h2 style="text-align:center;margin:6px 0 2px;">تقرير دورة «${esc(g.name)}»</h2>
      <p style="text-align:center;color:#555;margin:0 0 18px;">برنامج تعلّم العربية — السقيفة</p>

      <p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>

      ${paras.map(p=>`<p>${esc(p)}</p>`).join('\n      ')}

      <p style="text-align:left;font-weight:800;margin-top:26px;">مدير الأكاديمية</p>

    </div>
  `;

  evPrint(
    'report',
    'تقرير دورة '+g.name,
    html
  );
}

function ensureXLSX(){

  if(typeof XLSX==='undefined'){

    toast(
      'مكتبة Excel لم يتم تحميلها.',
      true
    );

    return false;
  }

  return true;
}

function downloadWorkbook(
  sheets,
  filename
){

  if(!ensureXLSX()) return;

  const wb=XLSX.utils.book_new();

  Object.entries(sheets).forEach(
    ([name,data])=>{

      const ws=
        XLSX.utils.json_to_sheet(
          data
        );

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        name
      );

    }
  );

  XLSX.writeFile(
    wb,
    filename
  );
}

function exportAllExcel(){

  const teachers=
    DATA.teachers.map(t=>({

      'المعرف':t.id,
      'الاسم':t.name,
      'الجوال':t.phone,
      'معرف الحساب':t.userId

    }));

  const rooms=
    DATA.rooms.map(r=>({

      'المعرف':r.id,
      'القاعة':r.name,
      'الدورة':r.course,
      'المعلم':
        getTeacher(r.teacherId)?.name||''

    }));

  const students=
    DATA.students.map(s=>({

      'المعرف':s.id,
      'الطالب':s.name,
      'الجوال':s.phone,
      'القاعة':
        getRoom(s.roomId)?.name||''

    }));

  const reports=
    DATA.reports.map(r=>({

      'المعلم':
        getTeacher(r.teacherId)?.name||'',

      'القاعة':
        getRoom(r.roomId)?.name||'',

      'الأسبوع':
        r.week||'',

      'محتوى التقرير':
        r.content||'',

      'رابط Google Drive':
        r.driveLink||'',

      'عدد الصور':
        r.images?.length||0,

      'التاريخ':
        fmtDate(r.date)

    }));

  downloadWorkbook(

    {
      'المعلمون':teachers,
      'القاعات':rooms,
      'الطلاب':students,
      'المهام':taskRows(DATA.tasks),
      'درجات المعلمين الأسبوعية':
        DATA.teacherScores.map(r=>{

          const row={
            'المعلم':getTeacher(r.teacherId)?.name||'',
            'الأسبوع':r.week
          };

          evCriteria().forEach(c=>{
            row[c.label]=Number(r.scores?.[c.key])||0;
          });

          row['الإجمالي']=evWeekTotal(r.teacherId,r.week);

          return row;
        }),
      'التقارير':reports
    },

    `منصة-تعلم-العربية-${new Date().toISOString().slice(0,10)}.xlsx`

  );

  toast('تم تصدير الملف');
}

function evExportSheets(){

  const crit=evCriteria();

  const sheets={};

  sheets['ملخص المعلمين']=
    DATA.teachers.map(t=>({
      'المعرّف':t.id,
      'الاسم':t.name,
      'الفئة':t.gender==='f'?'معلّمة':t.gender==='m'?'معلّم':'',
      'مجموع النقاط التراكمي':evCumulative(t.id),
      'الخصومات':getTeacherDeductionTotal(t.id)
    }));

  const weeks=
    Array.from(new Set(DATA.teacherScores.map(r=>r.week)))
      .sort((a,b)=>a-b);

  weeks.forEach(week=>{

    sheets['الأسبوع '+week]=
      DATA.teachers.map(t=>{

        const row={
          'الاسم':t.name,
          'الفئة':t.gender==='f'?'معلّمة':t.gender==='m'?'معلّم':''
        };

        crit.forEach(c=>{
          row[c.label]=
            Number(evScoreRow(t.id,week)?.scores?.[c.key])||0;
        });

        row['الإجمالي']=evWeekTotal(t.id,week);

        return row;
      });
  });

  sheets['المعايير']=
    crit.map(c=>({
      'المعرّف':c.key,
      'المعيار':c.label,
      'الدرجة القصوى':c.max
    }));

  sheets['بيانات الدورة']=[{
    'اسم الدورة':evCourseName(),
    'مدة الدورة (أسابيع)':evCourseWeeks(),
    'تاريخ التصدير':new Date().toLocaleDateString('ar-SA')
  }];

  return sheets;
}

function exportTeachersExcel(){

  if(!DATA.teachers.length){

    toast('لا توجد بيانات لتصديرها.',true);
    return;
  }

  downloadWorkbook(
    evExportSheets(),
    `${evCourseName().replace(/[\\/:*?"<>|]/g,'')||'تقييم-المعلمين'}.xlsx`
  );
}

function renderAdminSettings(){

  return panel(
    'الإعدادات',

    `
    <div class="settings-section">

      <h3>
        تغيير كلمة المرور
      </h3>

      <form
        onsubmit="changePassword(event)"
        class="form-grid">

        <input
          id="newPassword"
          type="password"
          class="input"
          placeholder="كلمة المرور الجديدة"
          minlength="6"
          required>

        <input
          id="confirmPassword"
          type="password"
          class="input"
          placeholder="تأكيد كلمة المرور"
          minlength="6"
          required>

        <button
          class="btn primary">

          تغيير كلمة المرور

        </button>

      </form>

    </div>

    <div class="settings-section">

      <h3>
        التصدير التلقائي
      </h3>

      <label class="switch-row">

        <input
          type="checkbox"
          ${
            DATA.autoExport
            ?'checked'
            :''
          }
          onchange="toggleAutoExport(this.checked)">

        <span>
          تفعيل التصدير التلقائي على هذا الجهاز
        </span>

      </label>

    </div>

    ${renderWipeSection()}

    <div class="settings-section">

      <h3>
        حساب الإدارة
      </h3>

      <p>
        ${esc(currentUser?.email||'')}
      </p>

    </div>
    `
  );
}

async function changePassword(e){

  e.preventDefault();

  const p1=
    $('newPassword')?.value||'';

  const p2=
    $('confirmPassword')?.value||'';

  if(p1.length<6){

    toast(
      'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
      true
    );

    return;
  }

  if(p1!==p2){

    toast(
      'كلمتا المرور غير متطابقتين.',
      true
    );

    return;
  }

  try{

    await sb(
      db()
      .auth
      .updateUser({
        password:p1
      })
    );

    $('newPassword').value='';
    $('confirmPassword').value='';

    toast(
      'تم تغيير كلمة المرور بنجاح.'
    );

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

function toggleAutoExport(value){

  DATA.autoExport=Boolean(value);

  localStorage.setItem(
    AUTO_EXPORT_KEY,
    value?'1':'0'
  );

  toast(
    value
    ? 'تم تفعيل التصدير التلقائي.'
    : 'تم إيقاف التصدير التلقائي.'
  );
}

/* =========================================================
   لوحة المعلم
   ========================================================= */

function renderTeacher(){

  renderHeaderActions();
  renderTeacherNav();

  const m=$('teacherMain');

  if(!m) return;

  const views={

    reports:renderTeacherReports,

    evals:renderTeacherEvals,

    attend:renderTeacherAttendance,

    announce:renderTeacherAnnouncements,

    settings:renderTeacherSettings

  };

  m.innerHTML=
    views[teacherTab]();

}

/* ---------- تقييماتي (المعلم يطّلع على تقييمه) ---------- */

function evWeekType(v){

  DATA.evalSettings.weekTypes=DATA.evalSettings.weekTypes||{};
  DATA.evalSettings.weekTypes[evWeek]=v;
  evQueueSave('week_types');
  toast('تم تحديد نوع التقييم');
}

const EV_RUBRIC_DEFAULT=
  'الدرجة من 5: 0 = لم يُنفَّذ · 1.5–3 = دون المطلوب · 2.5–4 = جيد · 3.5–5 = ممتاز (الكم 60٪ + الجودة 40٪، والمطلوب 3 عناصر في الأسبوع للدرجة الكاملة)';
const EV_RUBRIC_ATTEND=
  'الحضور في الموعد = 1 · التأخر = 0.5 · الغياب = 0 (تُحسب من بيانات الحضور عند توفرها)';

function renderTeacherEvals(){

  const t=getTeacher(currentTeacherId);
  const crit=evCriteria();
  const weeks=evCourseWeeks();
  const rows=
    DATA.teacherScores
      .filter(r=>r.teacherId===currentTeacherId)
      .sort((a,b)=>a.week-b.week);

  const weekCards=
    rows.length
    ? rows.map(r=>{

        const total=
          crit.reduce((s,c)=>s+(Number(r.scores?.[c.key])||0),0);
        const maxTotal=
          crit.reduce((s,c)=>s+(c.max||10),0);
        const pct=maxTotal?Math.round(total/maxTotal*100):0;
        const wtype=(DATA.evalSettings.weekTypes||{})[r.week]||'تقييم دورة';

        return `
          <div class="card-inner" style="margin-bottom:14px;">

            <h3 style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              الأسبوع ${r.week}
              <span class="assignee-tag" style="background:#ede9fe;color:#5b21b6;">${esc(wtype)}</span>
              <span style="margin-inline-start:auto;font-size:14px;color:#6b7280;">
                المجموع: ${total} من ${maxTotal} (${pct}٪)
              </span>
            </h3>

            <details style="margin-bottom:10px;">
              <summary style="cursor:pointer;font-weight:700;">كيف تُحسب الدرجات؟</summary>
              <div class="hint" style="text-align:right;margin-top:6px;line-height:1.9;">
                ${EV_RUBRIC_DEFAULT}<br>
                معيار الحضور: ${EV_RUBRIC_ATTEND}
              </div>
            </details>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المعيار</th>
                    <th>الدرجة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${crit.map(c=>{
                    const v=Number(r.scores?.[c.key])||0;
                    return `
                      <tr>
                        <td><b>${esc(c.label)}</b></td>
                        <td>${v} من ${c.max||10}</td>
                        <td style="color:#f59e0b;">${stars(v/((c.max||10)/5))}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

          </div>
        `;
      }).join('')
    : `
      <div class="empty">
        لم تُسجَّل تقييمات لك بعد. عند اعتماد الإدارة للتقييم
        الأسبوعي ستظهر نتائجك هنا.
      </div>
    `;

  return panel(
    'تقييماتي',

    `
    <div class="notice">
      ${esc(evCourseName())} · مدة الدورة ${weeks} أسبوعًا.
      هذه نتائج تقييمك كما اعتمدتها الإدارة.
    </div>

    ${weekCards}

    <div class="card-inner" style="margin-top:14px;">
      <h3>تقييمي للدورة</h3>
      <div class="hint" style="text-align:right;margin-bottom:8px;">
        مساحة حرة تكتب فيها تقييمك الكامل للدورة: سير العمل، الطلاب،
        التنظيم، وأي ملاحظات أو مقترحات تود إيصالها للإدارة.
      </div>
      <textarea id="courseEvalText" rows="5"
        style="width:100%;"
        placeholder="اكتب تقييمك للدورة هنا...">${esc((DATA.evalSettings.courseEvals||{})[currentTeacherId]||'')}</textarea>
      <div style="margin-top:8px;">
        <button class="btn btn-primary" onclick="saveTeacherCourseEval()">حفظ التقييم</button>
      </div>
    </div>
    `
  );
}

async function saveTeacherCourseEval(){

  const el=document.getElementById('courseEvalText');
  if(!el) return;

  if(!DATA.evalSettings.courseEvals) DATA.evalSettings.courseEvals={};
  DATA.evalSettings.courseEvals[currentTeacherId]=el.value.trim();

  try{
    await sb(
      db()
      .from('app_settings')
      .upsert({
        key:'course_evals',
        value:DATA.evalSettings.courseEvals,
        updated_at:new Date().toISOString()
      })
    );
    toast('تم حفظ تقييمك للدورة.');
  }catch(e){
    toast('لم يتم حفظ التقييم — ستتم مراجعته مع الإدارة.', true);
  }
}

/* =========================================================
   تقييم الطلاب - المعلم
   ========================================================= */

function renderTeacherEvaluate(){

  const rooms=teacherRooms();

  return panel(

    'تقييم الطلاب',

    `
    ${
      rooms.length
      ? `
        <div class="toolbar">

          <label>
            القاعة
          </label>

          <select
            class="input"
            onchange="selectedTeacherRoomId=this.value;selectedTeacherWeek=1;renderTeacher()">

            ${rooms.map(r=>`

              <option
                value="${r.id}"
                ${
                  selectedTeacherRoomId===r.id
                  ?'selected'
                  :''
                }>

                ${esc(r.name)}
                ${
                  r.course
                  ? ` — ${esc(r.course)}`
                  :''
                }

              </option>

            `).join('')}

          </select>

          <label>الأسبوع</label>

          <select
            class="input"
            onchange="selectedTeacherWeek=Number(this.value);renderTeacher()">

            ${Array.from(
              {length:(getRoom(selectedTeacherRoomId)?.durationWeeks)||24},
              (_,i)=>i+1
            ).map(w=>`

              <option
                value="${w}"
                ${selectedTeacherWeek===w?'selected':''}>
                أسبوع ${w}
              </option>

            `).join('')}

          </select>

        </div>

        ${renderTeacherRoomStudents()}

      `
      : `
        <div class="empty">
          لا توجد قاعات مرتبطة بحسابك حاليًا.
        </div>
      `
    }
    `
  );
}

function renderTeacherRoomStudents(){

  const room=
    getRoom(selectedTeacherRoomId);

  if(!room){

    return `
      <div class="empty">
        اختر قاعة أولاً.
      </div>
    `;
  }

  const students=
    DATA.students.filter(
      s=>s.roomId===room.id
    );

  if(!students.length){

    return `
      <div class="empty">
        لا يوجد طلاب في هذه القاعة.
      </div>
    `;
  }

  const week=selectedTeacherWeek||1;

  return `

    <div class="notice">

      كشف أسبوع ${week} — قيّم كل طالب من
      1 إلى 10 لكل معيار، ثم اضغط "حفظ" مرة
      واحدة أسفل الجدول لحفظ الكشف كاملاً.
      تقييمات الأسابيع السابقة لا تتأثر.

    </div>

    <form
      onsubmit="saveWeekEvaluations(event,'${room.id}',${week})">

      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>الطالب</th>

              ${CRITERIA.map(c=>`
                <th>${esc(c.label)}</th>
              `).join('')}

              <th>ملاحظة</th>
              <th>متوسط الأسبوع</th>

            </tr>

          </thead>

          <tbody>

            ${students.map(student=>{

              const evaluation=
                DATA.evaluations.find(
                  e=>e.studentId===student.id && e.week===week
                );

              const scores=
                evaluation?.scores||{};

              return `

                <tr>

                  <td>
                    ${esc(student.name)}
                  </td>

                  ${CRITERIA.map(c=>`

                    <td>

                      <select
                        name="score__${student.id}__${c.key}"
                        class="input"
                        required>

                        <option value="">-</option>

                        ${Array.from({length:10},(_,i)=>i+1).map(n=>`

                          <option
                            value="${n}"
                            ${
                              Number(scores[c.key]||0)===n
                              ?'selected'
                              :''
                            }>
                            ${n}
                          </option>

                        `).join('')}

                      </select>

                    </td>

                  `).join('')}

                  <td>

                    <input
                      type="text"
                      name="note__${student.id}"
                      class="input"
                      placeholder="ملاحظة"
                      value="${esc(evaluation?.note||'')}">

                  </td>

                  <td>

                    ${
                      evaluation
                      ? `
                        <b class="${scoreClass(
                          avgScores(scores,CRITERIA,10)
                        )}">
                          ${avgScores(scores,CRITERIA,10)}%
                        </b>
                      `
                      : '-'
                    }

                  </td>

                </tr>

              `;

            }).join('')}

          </tbody>

        </table>

      </div>

      <button
        class="btn primary block"
        style="margin-top:14px;">

        حفظ كشف أسبوع ${week} لكل الطلاب

      </button>

    </form>

  `;
}

async function saveWeekEvaluations(e,roomId,week){

  e.preventDefault();

  const room=
    getRoom(roomId);

  if(!room){
    toast('القاعة غير موجودة.',true);
    return;
  }

  const students=
    DATA.students.filter(
      s=>s.roomId===roomId
    );

  const w=Number(week)||1;

  const f=new FormData(e.target);

  try{

    for(const student of students){

      const payload={

        student_id:student.id,

        teacher_id:currentTeacherId,

        room_id:roomId,

        week:w,

        note:f.get(`note__${student.id}`)||''

      };

      CRITERIA.forEach(c=>{
        payload[c.key]=Number(
          f.get(`score__${student.id}__${c.key}`)||0
        );
      });

      const existing=
        DATA.evaluations.find(
          x=>x.studentId===student.id && x.week===w
        );

      let row;

      if(existing){

        row=await sb(

          db()
          .from('evaluations')
          .update(payload)
          .eq('id',existing.id)
          .select()
          .single()

        );

      }else{

        row=await sb(

          db()
          .from('evaluations')
          .insert(payload)
          .select()
          .single()

        );

      }

      const mapped=
        mapEval(row);

      DATA.evaluations=
        DATA.evaluations.filter(
          x=>!(x.studentId===student.id && x.week===w)
        );

      DATA.evaluations.push(mapped);

    }

    toast(`تم حفظ كشف أسبوع ${w} لجميع الطلاب`);

    renderTeacher();

    if(DATA.autoExport){
      setTimeout(
        exportAllExcel,
        500
      );
    }

  }catch(x){

    toast(
      friendlyError(x),
      true
    );
  }
}

/* =========================================================
   التقارير - المعلم
   ========================================================= */

function renderTeacherReports(){

  const rooms=teacherRooms();

  const myReports=
    DATA.reports.filter(
      r=>r.teacherId===currentTeacherId
    );

  return panel(

    'التقارير الأسبوعية',

    `
    <form
      onsubmit="addTeacherReport(event)"
      class="report-form">

      <select
        id="reportRoom"
        class="input"
        required>

        <option value="">
          اختر القاعة
        </option>

        ${rooms.map(r=>`

          <option value="${r.id}">
            ${esc(r.name)}
          </option>

        `).join('')}

      </select>

      <input
        id="reportWeek"
        class="input"
        placeholder="الأسبوع / الأسبوع الأول"
        required>

      <textarea
        id="reportContent"
        class="input"
        rows="6"
        placeholder="اكتب التقرير الأسبوعي..."
        required></textarea>

      <input
        id="reportDrive"
        class="input"
        type="url"
        placeholder="رابط Google Drive (اختياري)">

      <label>
        صور التقرير
      </label>

      <input
        id="reportImages"
        class="input"
        type="file"
        accept="image/*"
        multiple>

      <small>
        الحد الأقصى ${MAX_REPORT_IMAGES} صور.
      </small>

      <button
        class="btn primary">

        رفع التقرير

      </button>

    </form>

    <hr>

    <h3>
      تقاريري السابقة
    </h3>

    <div class="report-list">

      ${
        myReports.length
        ? myReports.map(r=>`

          <div class="report-card">

            <h4>
              ${esc(
                getRoom(r.roomId)?.name||'-'
              )}
              —
              ${esc(r.week)}
            </h4>

            <small>
              ${fmtDate(r.date)}
            </small>

            <p style="white-space:pre-wrap">
              ${esc(r.content)}
            </p>

            ${
              r.driveLink
              ? `
                <a
                  href="${esc(r.driveLink)}"
                  target="_blank"
                  rel="noopener"
                  class="link">

                  فتح Google Drive

                </a>
              `
              :''
            }

            ${
              r.images?.length
              ? `
                <div class="report-images">

                  ${r.images.map(img=>`

                    <img
                      src="${img}"
                      alt="صورة التقرير"
                      loading="lazy">

                  `).join('')}

                </div>
              `
              :''
            }

            <button
              class="btn danger small"
              onclick="deleteReport('${r.id}')">

              حذف

            </button>

          </div>

        `).join('')
        : `
          <div class="empty">
            لم ترفع أي تقارير حتى الآن.
          </div>
        `
      }

    </div>
    `
  );
}

async function addTeacherReport(e){

  e.preventDefault();

  const roomId=
    $('reportRoom')?.value;

  const week=
    $('reportWeek')?.value.trim();

  const content=
    $('reportContent')?.value.trim();

  const driveLink=
    $('reportDrive')?.value.trim();

  if(!roomId||!week||!content){

    toast(
      'أكمل بيانات التقرير.',
      true
    );

    return;
  }

  const files=
    Array.from(
      $('reportImages')?.files||[]
    ).slice(
      0,
      MAX_REPORT_IMAGES
    );

  try{

    const images=[];

    for(const file of files){

      const data=
        await compressImage(file);

      images.push(data);
    }

    const row=await sb(

      db()
      .from('reports')
      .insert({

        teacher_id:currentTeacherId,

        room_id:roomId,

        week,

        content,

        drive_link:
          driveLink||null,

        images

      })
      .select()
      .single()

    );

    DATA.reports.unshift(
      mapReport(row)
    );

    e.target.reset();

    toast('تم رفع التقرير بنجاح');

    renderTeacher();

  }catch(x){

    console.error(x);

    toast(
      friendlyError(x),
      true
    );
  }
}

function compressImage(file){

  return new Promise(
    (resolve,reject)=>{

      const reader=
        new FileReader();

      reader.onload=()=>{

        const img=
          new Image();

        img.onload=()=>{

          const max=1200;

          let w=img.width;
          let h=img.height;

          if(w>max){

            h=
              Math.round(
                h*max/w
              );

            w=max;
          }

          if(h>max){

            w=
              Math.round(
                w*max/h
              );

            h=max;
          }

          const canvas=
            document.createElement(
              'canvas'
            );

          canvas.width=w;
          canvas.height=h;

          const ctx=
            canvas.getContext('2d');

          ctx.drawImage(
            img,
            0,
            0,
            w,
            h
          );

          resolve(
            canvas.toDataURL(
              'image/jpeg',
              0.72
            )
          );

        };

        img.onerror=reject;

        img.src=
          reader.result;
      };

      reader.onerror=reject;

      reader.readAsDataURL(file);

    }
  );
}
/* =========================================================
   الإعلانات - المعلم
   ========================================================= */

function renderTeacherAnnouncements(){

  const announcements=
    DATA.announcements||[];

  const teacher=
    getTeacher(currentTeacherId);

  return panel(

    'الإعلانات',

    `
    <div class="announcement-list">

      ${
        announcements.length
        ? announcements.map(a=>`

          <div class="announcement-card">

            <div class="announcement-date">
              ${fmtDate(a.date)}
            </div>

            <div class="announcement-text">
              ${esc(a.text)}
            </div>

          </div>

        `).join('')
        : `
          <div class="empty">
            لا توجد إعلانات حاليًا.
          </div>
        `
      }

    </div>

    ${
      teacher
      ? `
        <button
          class="btn secondary"
          onclick="markAnnouncementsSeen()">

          ${icon('check')} تحديد الإعلانات كمقروءة

        </button>
      `
      :''
    }
    `
  );
}

async function markAnnouncementsSeen(){

  if(!currentTeacherId){
    return;
  }

  try{

    const now=new Date().toISOString();

    await sb(

      db()
      .from('teachers')
      .update({
        last_seen_announce:now
      })
      .eq('id',currentTeacherId)

    );

    const teacher=
      getTeacher(currentTeacherId);

    if(teacher){
      teacher.lastSeenAnnounce=now;
    }

    toast('تم تحديد الإعلانات كمقروءة');

    renderTeacher();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   إعدادات المعلم
   ========================================================= */

function renderTeacherSettings(){

  const teacher=
    getTeacher(currentTeacherId);

  return panel(

    'الإعدادات',

    `
    <div class="settings-section">

      <h3>
        بيانات الحساب
      </h3>

      <div class="info-list">

        <div>
          <strong>الاسم:</strong>
          ${esc(
            teacher?.name||
            currentProfile?.full_name||
            ''
          )}
        </div>

        <div>
          <strong>البريد:</strong>
          ${esc(
            currentUser?.email||
            ''
          )}
        </div>

        <div>
          <strong>الجوال:</strong>
          ${esc(
            teacher?.phone||
            '-'
          )}
        </div>

        <div>
          <strong>مجلد رفع الملفات (Drive):</strong>
          ${
            teacher?.driveFolderUrl
            ? `<a class="link" href="${esc(teacher.driveFolderUrl)}" target="_blank" rel="noopener">فتح مجلدي على Drive</a>`
            : 'لم يتم إنشاؤه من الإدارة بعد'
          }
        </div>

      </div>

    </div>

    <div class="settings-section">

      <h3>
        تحديث رقم الجوال
      </h3>

      <form
        onsubmit="updateTeacherPhone(event)"
        class="form-grid">

        <input
          id="teacherNewPhone"
          class="input"
          placeholder="رقم الجوال الجديد"
          value="${esc(teacher?.phone||'')}">

        <button
          class="btn primary">

          حفظ الرقم

        </button>

      </form>

    </div>

    <div class="settings-section">

      <h3>
        تغيير كلمة المرور
      </h3>

      <form
        onsubmit="teacherChangePassword(event)"
        class="form-grid">

        <input
          id="teacherNewPassword"
          type="password"
          class="input"
          placeholder="كلمة المرور الجديدة"
          minlength="6"
          required>

        <input
          id="teacherConfirmPassword"
          type="password"
          class="input"
          placeholder="تأكيد كلمة المرور"
          minlength="6"
          required>

        <button
          class="btn primary">

          تغيير كلمة المرور

        </button>

      </form>

    </div>
    `
  );
}

async function updateTeacherPhone(e){

  e.preventDefault();

  const phone=
    $('teacherNewPhone')?.value.trim();

  if(!phone){

    toast(
      'أدخل رقم الجوال.',
      true
    );

    return;
  }

  try{

    const row=await sb(

      db()
      .from('teachers')
      .update({
        phone
      })
      .eq('id',currentTeacherId)
      .select()
      .single()

    );

    const teacher=
      getTeacher(currentTeacherId);

    if(teacher){
      teacher.phone=row.phone||phone;
    }

    toast('تم تحديث رقم الجوال');

    renderTeacher();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

async function teacherChangePassword(e){

  e.preventDefault();

  const p1=
    $('teacherNewPassword')?.value||'';

  const p2=
    $('teacherConfirmPassword')?.value||'';

  if(p1.length<6){

    toast(
      'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
      true
    );

    return;
  }

  if(p1!==p2){

    toast(
      'كلمتا المرور غير متطابقتين.',
      true
    );

    return;
  }

  try{

    await sb(
      db()
      .auth
      .updateUser({
        password:p1
      })
    );

    e.target.reset();

    toast(
      'تم تغيير كلمة المرور بنجاح.'
    );

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   إحصائيات عامة
   ========================================================= */

function getStudentAverage(studentId){

  const rows=
    DATA.evaluations.filter(
      x=>x.studentId===studentId
    );

  if(!rows.length){
    return 0;
  }

  const total=rows.reduce(
    (sum,e)=>sum+avgScores(e.scores,CRITERIA,10),
    0
  );

  return Math.round(total/rows.length);
}

function getTeacherDeductionTotal(teacherId){

  return DATA.teacherDeductions
    .filter(
      x=>x.teacherId===teacherId
    )
    .reduce(
      (sum,x)=>
        sum+Number(x.points||0),
      0
    );
}

function getFinalTeacherScore(teacherId){

  const avg=
    getTeacherAverage(teacherId);

  const deductions=
    getTeacherDeductionTotal(
      teacherId
    );

  return Math.max(
    0,
    avg-deductions
  );
}

/* =========================================================
   خصومات المعلمين
   ========================================================= */

function renderTeacherDeductions(teacherId){

  const deductions=
    DATA.teacherDeductions.filter(
      d=>d.teacherId===teacherId
    );

  const total=
    getTeacherDeductionTotal(
      teacherId
    );

  return `

    <div class="deductions-box">

      <h3>
        الخصومات
      </h3>

      <form
        onsubmit="addTeacherDeduction(event,'${teacherId}')"
        class="form-grid">

        <input
          name="reason"
          class="input"
          placeholder="سبب الخصم"
          required>

        <input
          name="amount"
          type="number"
          min="0"
          step="1"
          class="input"
          placeholder="عدد النقاط"
          required>

        <button
          class="btn primary">

          إضافة خصم

        </button>

      </form>

      <p>
        إجمالي الخصومات:
        <strong>${total}</strong>
      </p>

      ${
        deductions.length
        ? deductions.map(d=>`

          <div class="deduction-row">

            <span>
              ${esc(d.reason)}
            </span>

            <strong>
              -${d.points}
            </strong>

            <button class="btn ghost small" onclick="editDeduction('${d.id}')">تعديل</button>
<button
              class="btn danger small"
              onclick="deleteTeacherDeduction('${d.id}')">

              حذف

            </button>

          </div>

        `).join('')
        : `
          <div class="empty">
            لا توجد خصومات.
          </div>
        `
      }

    </div>

  `;
}

async function addTeacherDeduction(
  e,
  teacherId
){

  e.preventDefault();

  const f=new FormData(e.target);

  const reason=
    String(f.get('reason')||'').trim();

  const amount=
    Number(f.get('amount')||0);

  if(!reason||amount<=0){

    toast(
      'أدخل سبب الخصم وعدد النقاط.',
      true
    );

    return;
  }

  try{

    const row=await sb(

      db()
      .from('teacher_deductions')
      .insert({

        teacher_id:teacherId,

        reason,

        amount

      })
      .select()
      .single()

    );

    DATA.teacherDeductions.unshift(
      mapDeduction(row)
    );

    toast('تمت إضافة الخصم');

    renderAdmin();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

async function deleteTeacherDeduction(id){

  if(!confirm('حذف الخصم؟')){
    return;
  }

  try{

    await sb(

      db()
      .from('teacher_deductions')
      .delete()
      .eq('id',id)

    );

    DATA.teacherDeductions=
      DATA.teacherDeductions.filter(
        x=>x.id!==id
      );

    toast('تم حذف الخصم');

    renderAdmin();

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   ترتيب أفضل الطلاب
   ========================================================= */

function getBestStudents(roomId=null){

  let students=
    DATA.students.slice();

  if(roomId){
    students=
      students.filter(
        s=>s.roomId===roomId
      );
  }

  return students
    .map(s=>({

      student:s,

      average:
        getStudentAverage(s.id)

    }))
    .filter(x=>x.average>0)
    .sort(
      (a,b)=>
        b.average-a.average
    );
}

function getBestTeachers(){

  return DATA.teachers
    .map(t=>({

      teacher:t,

      average:
        getFinalTeacherScore(t.id)

    }))
    .filter(x=>x.average>0)
    .sort(
      (a,b)=>
        b.average-a.average
    );
}

/* =========================================================
   بطاقة لوحة الإدارة الرئيسية
   ========================================================= */

function renderAdminDashboardStats(){

  const bestStudents=
    getBestStudents();

  const bestTeachers=
    getBestTeachers();

  return `

    <div class="stats-grid">

      <div class="stat-card">

        <strong>
          ${DATA.teachers.length}
        </strong>

        <span>
          المعلمون
        </span>

      </div>

      <div class="stat-card">

        <strong>
          ${DATA.rooms.length}
        </strong>

        <span>
          القاعات
        </span>

      </div>

      <div class="stat-card">

        <strong>
          ${DATA.students.length}
        </strong>

        <span>
          الطلاب
        </span>

      </div>

      <div class="stat-card">

        <strong>
          ${DATA.reports.length}
        </strong>

        <span>
          التقارير
        </span>

      </div>

    </div>

    <div class="dashboard-highlight">

      <h3>
        ${icon('trophy')} أفضل الطلاب
      </h3>

      ${
        bestStudents.slice(0,5).map(
          (x,i)=>`

            <div class="ranking-row">

              <span>
                ${i+1}.
                ${esc(x.student.name)}
              </span>

              <strong>
                ${x.average}%
              </strong>

            </div>

          `
        ).join('')
        ||
        '<div class="empty">لا توجد تقييمات كافية.</div>'
      }

    </div>

    <div class="dashboard-highlight">

      <h3>
        ${icon('users')} أفضل المعلمين
      </h3>

      ${
        bestTeachers.slice(0,5).map(
          (x,i)=>`

            <div class="ranking-row">

              <span>
                ${i+1}.
                ${esc(x.teacher.name)}
              </span>

              <strong>
                ${x.average}%
              </strong>

            </div>

          `
        ).join('')
        ||
        '<div class="empty">لا توجد تقييمات كافية.</div>'
      }

    </div>

  `;
}

/* =========================================================
   دعم التنقل بين القاعات
   ========================================================= */

function selectTeacherRoom(id){

  if(
    !teacherRooms().some(
      r=>r.id===id
    )
  ){
    return;
  }

  selectedTeacherRoomId=id;

  selectedTeacherWeek=1;

  teacherTab='reports';

  renderTeacher();
}

/* =========================================================
   تحديث البيانات من قاعدة البيانات
   ========================================================= */

async function refreshData(){

  try{

    await loadData();

    if(currentAdmin){

      renderAdmin();

    }else if(currentTeacherId){

      renderTeacher();

    }

    toast('تم تحديث البيانات');

  }catch(e){

    toast(
      friendlyError(e),
      true
    );
  }
}

/* =========================================================
   دعم مفتاح Escape
   ========================================================= */

document.addEventListener(
  'keydown',
  e=>{

    if(e.key==='Escape'){

      document
        .querySelectorAll('.modal')
        .forEach(m=>m.remove());

    }

  }
);

/* =========================================================
   مراقبة جلسة Supabase
   ========================================================= */

function setupAuthListener(){

  db().auth.onAuthStateChange(
    async (event,session)=>{

      if(
        event==='SIGNED_OUT'
      ){

        resetSession();

        showScreen(
          'screen-role'
        );

        setupLoginUI();

        return;
      }

      if(
        event==='TOKEN_REFRESHED'
      ){
        return;
      }

    }
  );
}

/* =========================================================
   تشغيل المنصة
   ========================================================= */

async function boot(){

  try{

    if(
      typeof supabaseClient==='undefined'
    ){

      console.error(
        'supabaseClient غير موجود.'
      );

      toast(
        'خطأ: لم يتم إعداد Supabase في index.html.',
        true
      );

      return;
    }

    setupLoginUI();

    setupAuthListener();

    const {
      data:{
        session
      }
    }=
      await db()
      .auth
      .getSession();

    if(!session){

      let savedTeacherId=null;
      let savedTeacherCode=null;

      try{
        savedTeacherId=
          localStorage.getItem('saqifah:teacherSession');
        savedTeacherCode=
          localStorage.getItem('saqifah:teacherCode');
      }catch{}

      if(savedTeacherId && savedTeacherCode){

        // إعادة التحقق من كود المعلم على الخادم:
        // إذا غيّرت الإدارة الكود تُغلق الجلسة القديمة فورًا
        let verified=null;
        let checkFailed=false;

        try{

          verified=await sb(
            db().rpc('verify_teacher_login',{
              p_id:savedTeacherId,
              p_code:savedTeacherCode
            })
          );

        }catch(e){

          checkFailed=true;

          console.warn(
            'تعذر التحقق من جلسة المعلم:',
            e
          );
        }

        if(verified){

          try{

            await loadData();

            const t=getTeacher(savedTeacherId);

            if(t){

              currentUser={codeLogin:true,name:t.name};
              currentAdmin=false;
              currentTeacherId=t.id;

              selectedTeacherRoomId=
                teacherRooms()[0]?.id||null;

              teacherTab='reports';

              showScreen('screen-teacher');

              renderTeacher();

              return;
            }

          }catch(e){

            console.warn(
              'تعذر استعادة جلسة المعلم:',
              e
            );
          }

          try{
            localStorage.removeItem('saqifah:teacherSession');
            localStorage.removeItem('saqifah:teacherCode');
          }catch{}

        }else if(!checkFailed){

          // الكود تغيّر فعلًا - إنهاء الجلسة وطلب الدخول بالكود الجديد
          try{
            localStorage.removeItem('saqifah:teacherSession');
            localStorage.removeItem('saqifah:teacherCode');
          }catch{}

          toast(
            'تم تغيير كود دخولك - سجّل الدخول بالكود الجديد.'
          );
        }
        // عند تعذر الاتصال بالخادم تبقى الجلسة محفوظة
        // وتظهر شاشة الدخول فقط دون حذفها

      }else if(savedTeacherId){

        // جلسة من قبل هذا التحديث (بدون كود محفوظ):
        // تُطلب إعادة الدخول مرة واحدة ثم تُحفظ بشكل آمن
        try{
          localStorage.removeItem('saqifah:teacherSession');
        }catch{}
      }

      let savedCeoId=null;

      try{
        savedCeoId=
          localStorage.getItem('saqifah:ceoSession');
      }catch{}

      if(savedCeoId){

        try{

          const ceoRow=await sb(
            db()
            .from('employees')
            .select('*')
            .eq('id',savedCeoId)
            .eq('is_ceo',true)
            .maybeSingle()
          );

          if(ceoRow){

            currentUser={employeeLogin:true,ceoLogin:true,name:ceoRow.name};
            currentAdmin=false;
            currentEmployeeId=ceoRow.id;
            currentIsCeo=true;
            currentCeoCode=''; // login_code لم يعد متاحًا للقراءة العامة - يُطلب الكود الحالي عند التغيير

            await loadData();

            ceoTab='tasks';

            showScreen('screen-ceo');

            renderCeo();

            return;
          }

        }catch(e){

          console.warn(
            'تعذر استعادة جلسة مدير الأكاديمية:',
            e
          );
        }

        currentEmployeeId=null;
        currentIsCeo=false;

        try{
          localStorage.removeItem('saqifah:ceoSession');
        }catch{}
      }

      let savedEmployeeId=null;

      try{
        savedEmployeeId=
          localStorage.getItem('saqifah:employeeSession');
      }catch{}

      if(savedEmployeeId){

        try{

          currentEmployeeId=savedEmployeeId;

          await loadData();

          const emp=getEmployee(savedEmployeeId);

          if(emp){

            currentUser={employeeLogin:true,name:emp.name};
            currentAdmin=false;
            employeeTab='tasks';

            showScreen('screen-employee');

            renderEmployee();

            return;
          }

        }catch(e){

          console.warn(
            'تعذر استعادة جلسة الموظف:',
            e
          );
        }

        currentEmployeeId=null;

        try{
          localStorage.removeItem('saqifah:employeeSession');
        }catch{}
      }

      showScreen(
        'screen-role'
      );

      return;
    }

    try{

      await loadSessionProfile();

    }catch(e){

      console.error(e);

      await db()
        .auth
        .signOut();

      showScreen(
        'screen-role'
      );

      return;
    }

    await loadData();

    if(
      currentProfile?.role==='admin'
    ){

      currentAdmin=true;

      adminTab='rooms';

      showScreen(
        'screen-admin'
      );

      renderAdmin();

      toast(
        'مرحبًا بك في لوحة الإدارة'
      );

    }else if(
      currentProfile?.role==='teacher'
    ){

      currentAdmin=false;

      currentTeacherId=
        currentProfile.teacher_id;

      if(!currentTeacherId){

        await db()
          .auth
          .signOut();

        resetSession();

        showScreen(
          'screen-role'
        );

        toast(
          'حساب المعلم غير مرتبط بسجل معلم.',
          true
        );

        return;
      }

      selectedTeacherRoomId=
        teacherRooms()[0]?.id||null;

      teacherTab='reports';

      showScreen(
        'screen-teacher'
      );

      renderTeacher();

      toast(
        'تم تسجيل الدخول بنجاح'
      );

    }else{

      await db()
        .auth
        .signOut();

      resetSession();

      showScreen(
        'screen-role'
      );

      toast(
        'هذا الحساب ليس له دور محدد.',
        true
      );
    }

  }catch(e){

    console.error(
      'Boot error:',
      e
    );

    toast(
      friendlyError(e),
      true
    );

    showScreen(
      'screen-role'
    );
  }
}

/* =========================================================
   الموظفون والمهام (مجموعات + مهام عامة)
   ========================================================= */

const staffNav = {
  admin:{view:'home',group:null},
  employee:{view:'home',group:null}
};

let staffFilterStatus = 'all';
let staffFilterEmp = 'all';

function nav(){
  return currentAdmin?staffNav.admin:staffNav.employee;
}

function getGroup(id){
  return DATA.groups.find(g=>g.id===id);
}

function groupTasks(groupId){
  return DATA.tasks.filter(t=>(t.groupId||null)===(groupId||null));
}

function currentGroupId(){
  const n=nav();
  return n.view==='general'?null:n.group;
}

function taskCounts(list){

  return {
    total:list.length,
    todo:list.filter(t=>t.status==='todo').length,
    doing:list.filter(t=>t.status==='doing').length,
    done:list.filter(t=>t.status==='done').length
  };
}

function donePercent(list){

  if(!list.length) return 0;

  return Math.round(
    list.filter(t=>t.status==='done').length/list.length*100
  );
}

function isOverdue(t){

  if(!t.dueDate || t.status==='done') return false;

  return t.dueDate < new Date().toISOString().slice(0,10);
}

function statusBadge(t){

  return `
    <span class="status-badge ${t.status}">
      ${taskStatusLabel(t.status)}
    </span>
    ${
      isOverdue(t)
      ? '<span class="status-badge overdue">متأخرة</span>'
      : ''
    }
  `;
}

function statusSelect(task){

  return `
    <select
      class="input"
      onchange="setTaskStatus('${task.id}',this.value)">

      ${TASK_STATUSES.map(s=>`
        <option
          value="${s.key}"
          ${task.status===s.key?'selected':''}>
          ${s.label}
        </option>
      `).join('')}

    </select>
  `;
}

function shortName(e){

  if(!e) return '';

  const ov=(DATA.evalSettings.employeeShortNames||{})[e.id];
  if(ov) return ov;

  const parts=String(e.name||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length<=2) return parts.join(' ');

  const titled=/^(د\.|أ\.|د|أ)$/.test(parts[0]);
  if(titled) return parts[0]+' '+parts[1]+' '+parts[parts.length-1];

  return parts[0]+' '+parts[parts.length-1];
}

function assigneeTags(t){

  if(!t.employeeIds.length){
    return '<span class="hint">غير مسندة</span>';
  }

  return t.employeeIds.map(id=>{

    const e=getEmployee(id);

    if(!e) return '';

    return `
      <span class="assignee-tag ${id===currentEmployeeId?'me':''} ${e.isCeo?'ceo':''}">
        ${e.isCeo?'<span class="ceo-dot"></span>':''}${esc(shortName(e))}
      </span>
    `;

  }).join('');
}

function rerenderStaffViews(){

  if(currentAdmin){
    renderAdmin();
  }else if(currentEmployeeId){
    if(currentIsCeo){ renderCeo(); }else{ renderEmployee(); }
  }
}

function openStaffView(view,group=null){

  const n=nav();

  n.view=view;
  n.group=group;

  staffFilterStatus='all';
  staffFilterEmp='all';
  staffDraft=[];
  staffDraftDue='';

  rerenderStaffViews();

  window.scrollTo?.(0,0);
}

/* ---------- نقطة الدخول المشتركة ---------- */

function renderStaffRoute(isAdmin){

  const n=nav();

  if(n.view==='employees' && isAdmin){
    return renderStaffEmployeesAdmin();
  }

  if(n.view==='templates' && isAdmin){
    return renderStaffTemplates();
  }

  if(n.view==='general'){
    return renderStaffBoard(isAdmin);
  }

  if(n.view==='group'){

    if(getGroup(n.group)){
      return renderStaffBoard(isAdmin);
    }

    n.view='home';
  }

  return panel(
    isAdmin?'الموظفون والمهام':'لوحة المهام',
    renderStaffHome(isAdmin)
  );
}

function renderAdminStaff(){
  return renderStaffRoute(true);
}

/* ---------- الصفحة الرئيسية: صناديق المجموعات ---------- */

function renderGroupTile(label,desc,tasks,onclick,actions,cls){

  const c=taskCounts(tasks);

  return `

    <div
      class="group-tile ${cls||''}"
      onclick="${onclick}">

      <div class="group-name">${esc(label)}</div>

      ${
        desc
        ? `<div class="group-desc">${esc(desc)}</div>`
        : ''
      }

      <div class="group-meta">
        ${c.total} مهمة · ${c.done} تمت
        ${c.doing?` · ${c.doing} قيد العمل`:''}
      </div>

      ${
        c.total
        ? progressBarHtml(donePercent(tasks))
        : '<div class="progress-track"></div>'
      }

      ${actions||''}

    </div>

  `;
}

function renderStaffHome(isAdmin){

  const c=taskCounts(DATA.tasks);

  return `

    <div class="stats-grid">

      <div class="stat-card">
        <strong>${c.total}</strong>
        <span>إجمالي المهام</span>
      </div>

      <div class="stat-card">
        <strong>${c.todo}</strong>
        <span>لم تتم</span>
      </div>

      <div class="stat-card">
        <strong>${c.doing}</strong>
        <span>قيد العمل</span>
      </div>

      <div class="stat-card">
        <strong>${c.done}</strong>
        <span>تمت</span>
      </div>

    </div>

    <div class="group-grid">

      ${DATA.groups.map(g=>

        renderGroupTile(
          g.name,
          g.description,
          groupTasks(g.id),
          `openStaffView('group','${g.id}')`,
          isAdmin
            ? `
              <div
                class="group-actions"
                onclick="event.stopPropagation()">

                <button
                  class="btn ghost small"
                  onclick="openGroupModal('${g.id}')">
                  تعديل
                </button>

                <button
                  class="btn danger small"
                  onclick="deleteGroup('${g.id}')">
                  حذف
                </button>

              </div>
            `
            : '',
          ''
        )

      ).join('')}

      ${renderGroupTile(
        'مهام عامة',
        'مهام متعلقة بالبرنامج بشكل عام',
        groupTasks(null),
        "openStaffView('general')",
        '',
        'general'
      )}

      ${
        isAdmin
        ? `
          <div
            class="group-tile add"
            onclick="openGroupModal()">
            ${icon('plus')} إضافة مجموعة
          </div>
        `
        : ''
      }

    </div>

    ${
      isAdmin || currentIsCeo
      ? `
        <div class="toolbar">

          ${
            isAdmin
            ? `
              <button
                class="btn ghost"
                onclick="openStaffView('employees')">
                إدارة الموظفين وأكوادهم
              </button>

              <button
                class="btn ghost"
                onclick="openStaffView('templates')">
                ${icon('clipboard')} قالب المهام
              </button>
            `
            : ''
          }

          <button
            class="btn primary"
            onclick="printTasksReport('all')">
            ${icon('file')} تقرير شامل (PDF)
          </button>

          <button
            class="btn secondary"
            onclick="exportTasksExcel('all')">
            ${icon('download')} تصدير Excel
          </button>

        </div>
      `
      : ''
    }

    <div class="dashboard-highlight">

      <h3>إنجاز الموظفين</h3>

      ${
        DATA.employees.length
        ? DATA.employees.map(e=>{

            const mine=
              DATA.tasks.filter(
                t=>t.employeeIds.includes(e.id)
              );

            const pct=donePercent(mine);

            return `
              <div class="progress-row">

                <span class="progress-label">
                  ${esc(e.name)}${e.id===currentEmployeeId?' (أنت)':''}
                </span>

                ${
                  mine.length
                  ? progressBarHtml(pct)
                  : '<div class="progress-track"></div>'
                }

                <span class="progress-pct">
                  ${mine.length?pct+'%':'-'}
                </span>

              </div>
            `;
          }).join('')
        : '<div class="empty">لا يوجد موظفون بعد.</div>'
      }

    </div>

    ${
      isAdmin
      ? `
        <div class="deductions-box">

          <h3>حذف المهام</h3>

          <div class="notice">
            الحذف نهائي ولا يمكن التراجع عنه. لحذف بيانات المنصة كلها
            (طلاب، تقييمات، تقارير...) استخدم "الإعدادات" ثم "حذف البيانات القديمة".
          </div>

          <div class="export-buttons" style="justify-content:flex-start;margin-top:0;">

            <button
              class="btn ghost"
              onclick="clearStaffData('done')">
              حذف المهام المنتهية (تمت) — ${c.done}
            </button>

            <button
              class="btn danger"
              onclick="clearStaffData('all')">
              حذف جميع المهام — ${c.total}
            </button>

            <button
              class="btn danger"
              onclick="clearStaffData('everything')">
              حذف كل شيء (المجموعات والموظفين والمهام)
            </button>

          </div>

        </div>
      `
      : ''
    }

  `;
}

/* ---------- لوحة مهام مجموعة / مهام عامة ---------- */

function filteredBoardTasks(gid){

  let tasks=groupTasks(gid);

  if(staffFilterStatus!=='all'){
    tasks=tasks.filter(t=>t.status===staffFilterStatus);
  }

  if(staffFilterEmp==='mine'){

    tasks=tasks.filter(
      t=>t.employeeIds.includes(currentEmployeeId)
    );

  }else if(staffFilterEmp!=='all'){

    tasks=tasks.filter(
      t=>t.employeeIds.includes(staffFilterEmp)
    );
  }

  const order={todo:0,doing:1,done:2};

  tasks.sort((a,b)=>
    (order[a.status]-order[b.status]) ||
    String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))
  );

  return tasks;
}

function renderStaffBoard(isAdmin){

  const n=nav();

  const isGeneral=n.view==='general';

  const group=isGeneral?null:getGroup(n.group);

  const gid=isGeneral?null:group.id;

  const title=isGeneral?'مهام عامة':group.name;

  const all=groupTasks(gid);

  const c=taskCounts(all);

  const tasks=filteredBoardTasks(gid);

  return panel(
    title,

    `
    <div class="toolbar">

      <button
        class="btn ghost small"
        onclick="openStaffView('home')">
        ${icon('back')} رجوع للمجموعات
      </button>

      ${
        isAdmin && !isGeneral
        ? `
          <button
            class="btn ghost small"
            onclick="openGroupModal('${gid}')">
            تعديل المجموعة
          </button>

          <button
            class="btn danger small"
            onclick="deleteGroup('${gid}')">
            حذف المجموعة
          </button>
        `
        : ''
      }

      ${
        isAdmin || currentIsCeo
        ? `
          <button
            class="btn primary small"
            onclick="printTasksReport(${isGeneral?'null':`'${gid}'`})">
            ${icon('file')} تقرير المجموعة (PDF)
          </button>

          <button
            class="btn secondary small"
            onclick="exportTasksExcel(${isGeneral?'null':`'${gid}'`})">
            ${icon('download')} Excel
          </button>
        `
        : ''
      }

      ${
        isAdmin && !isGeneral
        ? `
          <button
            class="btn ghost small"
            onclick="applyTemplateToGroup('${gid}')">
            ${icon('plus')} مهام القالب
          </button>

          <button
            class="btn ghost small"
            onclick="saveGroupAsTemplate('${gid}')">
            ${icon('save')} حفظ كقالب
          </button>
        `
        : ''
      }

    </div>

    ${
      !isGeneral && group.description
      ? `<div class="notice">${esc(group.description)}</div>`
      : ''
    }

    <div class="stats-grid">

      <div class="stat-card">
        <strong>${c.total}</strong>
        <span>المهام</span>
      </div>

      <div class="stat-card">
        <strong>${c.todo}</strong>
        <span>لم تتم</span>
      </div>

      <div class="stat-card">
        <strong>${c.doing}</strong>
        <span>قيد العمل</span>
      </div>

      <div class="stat-card">
        <strong>${c.done}</strong>
        <span>تمت</span>
      </div>

    </div>

    ${isAdmin?renderTaskDraftSection():''}

    <div class="toolbar">

      ${
        isAdmin
        ? `
          <button
            type="button"
            class="btn secondary small"
            onclick="openTaskModal()">
            ${icon('plus')} إضافة مهمة
          </button>
        `
        : ''
      }

      <label>الحالة</label>

      <select
        class="input"
        style="width:auto;"
        onchange="staffFilterStatus=this.value;rerenderStaffViews()">

        <option value="all">الكل</option>

        ${TASK_STATUSES.map(s=>`
          <option
            value="${s.key}"
            ${staffFilterStatus===s.key?'selected':''}>
            ${s.label}
          </option>
        `).join('')}

      </select>

      <label>${isAdmin?'الموظف':'عرض'}</label>

      <select
        class="input"
        style="width:auto;"
        onchange="staffFilterEmp=this.value;rerenderStaffViews()">

        <option value="all">الكل</option>

        ${
          isAdmin
          ? ''
          : `
            <option
              value="mine"
              ${staffFilterEmp==='mine'?'selected':''}>
              مهامي فقط
            </option>
          `
        }

        ${
          isAdmin
          ? DATA.employees.map(e=>`
              <option
                value="${e.id}"
                ${staffFilterEmp===e.id?'selected':''}>
                ${esc(e.name)}
              </option>
            `).join('')
          : ''
        }

      </select>

    </div>

    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>المهمة</th>
            <th>المسند إليهم</th>
            <th>الاستحقاق</th>
            <th>الحالة</th>
            <th>تحديث الحالة</th>
            <th>ملاحظة</th>
            ${isAdmin?'<th></th>':''}
          </tr>
        </thead>

        <tbody>

          ${
            tasks.length
            ? (()=>{
              const phIdx=t=>{
                const i=TASK_PHASES.indexOf(taskPhase(t));
                return i===-1?99:i;
              };
              const sorted=[...tasks].sort((a,b)=>phIdx(a)-phIdx(b));
              let lastPhase;
              return sorted.map(t=>{

                const mine=
                  !isAdmin &&
                  t.employeeIds.includes(currentEmployeeId);

                const ph=taskPhase(t);
                const phRow=(ph&&ph!==lastPhase)
                  ?`<tr class="phase-row"><td colspan="${isAdmin?7:6}">${icon('folder')} ${ph}</td></tr>`
                  :'';
                lastPhase=ph;

                return phRow+`

                  <tr class="${mine?'mine-row':''}">

                    <td>
                      <b>${esc(taskDisplayTitle(t))}</b>
                      ${(()=>{const sp=splitTaskDesc(t);return sp.desc
                        ? `<div class="hint" style="text-align:right;margin-top:4px;white-space:pre-wrap;">${esc(sp.desc)}</div>`
                        : ''})()}
                    </td>

                    <td class="assignee-cell">
                      ${assigneeTags(t)}
                    </td>

                    <td>
                      ${t.dueDate?fmtDate(t.dueDate):'-'}
                    </td>

                    <td>
                      ${statusBadge(t)}
                      ${
                        t.updatedBy
                        ? `<div class="hint" style="text-align:right;margin-top:4px;">آخر تحديث: ${esc(t.updatedBy)}</div>`
                        : ''
                      }
                    </td>

                    <td>
                      ${statusSelect(t)}
                    </td>

                    <td>
                      ${(()=>{const sp=splitTaskDesc(t);return `
                        ${!isAdmin&&sp.adminNote?`<div class="admin-note">${icon('pin')} ${esc(sp.adminNote)}</div>`:''}
                        ${isAdmin?`
                          <input class="input" placeholder="ملاحظات المدير" value="${esc(sp.adminNote)}" onchange="saveTaskAdminNote('${t.id}',this.value)">
                          <input class="input" style="margin-top:6px" placeholder="ملاحظة الموظف" value="${esc(t.employeeNote)}" onchange="saveTaskNote('${t.id}',this.value)">
                        `: mine?`
                          <input class="input" style="margin-top:6px" placeholder="ملاحظتك (اختياري)" value="${esc(t.employeeNote)}" onchange="saveTaskNote('${t.id}',this.value)">
                        `: t.employeeNote?`<div class="hint" style="text-align:right;">${esc(t.employeeNote)}</div>`:(sp.adminNote?'':'-')}
                      `})()}
                    </td>

                    ${
                      isAdmin
                      ? `
                        <td style="display:flex;gap:6px;flex-wrap:wrap;">

                          <button
                            class="btn ghost small"
                            onclick="openTaskModal('${t.id}')">
                            تعديل
                          </button>

                          <button
                            class="btn danger small"
                            onclick="deleteTask('${t.id}')">
                            حذف
                          </button>

                        </td>
                      `
                      : ''
                    }

                  </tr>

                `;
              }).join('');
            })()
            : `
              <tr>
                <td colspan="${isAdmin?7:6}">
                  لا توجد مهام مطابقة.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
    `
  );
}

/* ---------- إدخال مهام كثيرة دفعة واحدة ---------- */

function renderTaskDraftSection(){

  return `

    <div class="card-inner">

      <h3>إضافة عدة مهام دفعة واحدة</h3>

      <div class="notice">

        اكتب المهام كلها هنا، كل مهمة في سطر مستقل، ثم اضغط
        "تجهيز المهام" لتحديد الموظف أو الموظفين المشتركين في
        كل مهمة (المهمة الواحدة يشترك فيها كل من تحدده).

      </div>

      <div class="form-grid">

        <textarea
          id="bulkTasksText"
          class="input"
          rows="5"
          placeholder="المهمة الأولى&#10;المهمة الثانية&#10;المهمة الثالثة"></textarea>

        <input
          id="bulkTasksDue"
          type="date"
          class="input"
          value="${esc(staffDraftDue)}"
          title="تاريخ الاستحقاق لكل المهام (اختياري)">

        <button
          type="button"
          class="btn secondary"
          onclick="prepareTaskDraft()">
          تجهيز المهام
        </button>

      </div>

      ${renderTaskDraftList()}

    </div>

  `;
}

function renderTaskDraftList(){

  if(!staffDraft.length) return '';

  return `

    <div class="dashboard-highlight">

      <h3>إسناد المهام (${staffDraft.length})</h3>

      ${staffDraft.map((d,i)=>`

        <div class="card-inner">

          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">

            <b>${i+1}. ${esc(d.title)}</b>

            <span style="display:flex;gap:6px;flex-wrap:wrap;">

              <button
                type="button"
                class="btn ghost small"
                onclick="draftSelectAll(${i},true)">
                كل الموظفين
              </button>

              <button
                type="button"
                class="btn ghost small"
                onclick="draftSelectAll(${i},false)">
                إلغاء التحديد
              </button>

              <button
                type="button"
                class="btn danger small"
                onclick="removeDraftTask(${i})">
                إزالة
              </button>

            </span>

          </div>

          <div class="assignee-grid">

            ${DATA.employees.map(e=>`

              <label class="assignee-chip">

                <input
                  type="checkbox"
                  data-draft="${i}"
                  ${d.employeeIds.includes(e.id)?'checked':''}
                  onchange="toggleDraftEmployee(${i},'${e.id}',this.checked)">

                <span>${esc(e.name)}</span>

              </label>

            `).join('')}

          </div>

        </div>

      `).join('')}

      <div style="display:flex;gap:10px;flex-wrap:wrap;">

        <button
          type="button"
          class="btn primary"
          onclick="saveTaskDraft()">
          حفظ المهام
        </button>

        <button
          type="button"
          class="btn ghost"
          onclick="clearTaskDraft()">
          إلغاء
        </button>

      </div>

    </div>

  `;
}

function prepareTaskDraft(){

  const lines=
    ($('bulkTasksText')?.value||'')
      .split('\n')
      .map(l=>l.trim())
      .filter(Boolean);

  if(!lines.length){

    toast('اكتب مهمة واحدة على الأقل.',true);
    return;
  }

  staffDraftDue=
    $('bulkTasksDue')?.value||'';

  lines.forEach(title=>{
    staffDraft.push({title,employeeIds:[]});
  });

  renderAdmin();
}

function toggleDraftEmployee(i,id,checked){

  const d=staffDraft[i];

  if(!d) return;

  d.employeeIds=
    d.employeeIds.filter(x=>x!==id);

  if(checked){
    d.employeeIds.push(id);
  }
}

function draftSelectAll(i,on){

  const d=staffDraft[i];

  if(!d) return;

  d.employeeIds=
    on?DATA.employees.map(e=>e.id):[];

  document
    .querySelectorAll(`input[data-draft="${i}"]`)
    .forEach(c=>{c.checked=on;});
}

function removeDraftTask(i){

  staffDraft.splice(i,1);

  renderAdmin();
}

function clearTaskDraft(){

  staffDraft=[];
  staffDraftDue='';

  renderAdmin();
}

async function saveTaskDraft(){

  if(!staffDraft.length) return;

  const rows=
    staffDraft.map(d=>({
      group_id:currentGroupId(),
      title:d.title,
      due_date:staffDraftDue||null,
      status:'doing',
      employee_ids:d.employeeIds
    }));

  try{

    const inserted=await sb(
      db()
      .from('tasks')
      .insert(rows)
      .select()
    );

    (inserted||[])
      .map(mapTask)
      .reverse()
      .forEach(t=>DATA.tasks.unshift(t));

    toast(`تمت إضافة ${rows.length} مهمة`);

    staffDraft=[];
    staffDraftDue='';

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- إضافة / تعديل مهمة (نافذة) ---------- */

function openTaskModal(id){

  const t=id?DATA.tasks.find(x=>x.id===id):null;

  const gid=t?t.groupId:currentGroupId();

  openEditModal({

    title:t?'تعديل المهمة':'إضافة مهمة جديدة',

    fields:[
      {key:'title',label:'المهمة',value:t?.title||'',required:true},
      {key:'description',label:'التفاصيل (اختياري)',type:'textarea',value:t?splitTaskDesc(t).desc:''},
      {key:'dueDate',label:'تاريخ الاستحقاق',type:'date',value:t?.dueDate||''},
      {key:'status',label:'الحالة',type:'select',value:t?.status||'doing',
        options:TASK_STATUSES.map(s=>({value:s.key,label:s.label}))},
      {key:'groupId',label:'المجموعة',type:'select',value:gid||'',
        options:[
          {value:'',label:'مهام عامة'},
          ...DATA.groups.map(g=>({value:g.id,label:g.name}))
        ]},
      {key:'employeeIds',label:'المشتركون في المهمة',type:'checkboxes',
        value:t?.employeeIds||[],
        options:DATA.employees.map(e=>({value:e.id,label:e.name}))}
    ],

    onSave:async v=>{

      const payload={
        title:v.title,
        description:t?joinTaskDesc(v.description,splitTaskDesc(t).adminNote):v.description,
        due_date:v.dueDate||null,
        status:v.status,
        group_id:v.groupId||null,
        employee_ids:v.employeeIds,
        updated_at:new Date().toISOString(),
        updated_by:'الإدارة'
      };

      if(t){

        const row=await updateRow('tasks',t.id,payload);

        DATA.tasks=
          DATA.tasks.map(x=>x.id===t.id?mapTask(row):x);

        toast('تم حفظ التعديل');

      }else{

        const row=await sb(
          db().from('tasks').insert(payload).select().single()
        );

        DATA.tasks.unshift(mapTask(row));

        toast('تمت إضافة المهمة');
      }

      renderAdmin();
    }
  });
}

async function deleteTask(id){

  if(!confirm('حذف هذه المهمة؟')) return;

  try{

    await sb(
      db()
      .from('tasks')
      .delete()
      .eq('id',id)
    );

    DATA.tasks=
      DATA.tasks.filter(t=>t.id!==id);

    toast('تم حذف المهمة');

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function setTaskStatus(id,status){

  try{

    const row=await updateRow('tasks',id,{
      status,
      updated_at:new Date().toISOString(),
      updated_by:currentAdmin
        ? 'الإدارة'
        : (getEmployee(currentEmployeeId)?.name||'')
    });

    DATA.tasks=
      DATA.tasks.map(t=>t.id===id?mapTask(row):t);

    toast(`الحالة: ${taskStatusLabel(status)}`);

    rerenderStaffViews();

  }catch(x){

    toast(friendlyError(x),true);

    rerenderStaffViews();
  }
}

async function saveTaskNote(id,note){

  try{

    const row=await updateRow('tasks',id,{
      employee_note:note.trim(),
      updated_at:new Date().toISOString()
    });

    DATA.tasks=
      DATA.tasks.map(t=>t.id===id?mapTask(row):t);

    toast('تم حفظ الملاحظة');

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function saveTaskAdminNote(id,note){

  try{

    const cur=DATA.tasks.find(t=>t.id===id);
    const sp=splitTaskDesc(cur);

    const row=await updateRow('tasks',id,{
      description:joinTaskDesc(sp.desc,note),
      updated_at:new Date().toISOString()
    });

    DATA.tasks=
      DATA.tasks.map(t=>t.id===id?mapTask(row):t);

    toast('تم حفظ ملاحظات المدير');

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- المجموعات ---------- */

function openGroupModal(id){

  const g=id?getGroup(id):null;

  openEditModal({

    title:g?'تعديل المجموعة':'إضافة مجموعة جديدة',

    fields:[
      {key:'name',label:'اسم المجموعة',value:g?.name||'',required:true},
      {key:'description',label:'وصف (اختياري)',type:'textarea',value:g?.description||''},
      ...(
        !g && DATA.taskTemplates.length
          ? [{
              key:'useTemplate',
              label:'مهام القالب',
              type:'checkboxes',
              value:['1'],
              options:[{
                value:'1',
                label:`إنشاء مهام القالب تلقائيًا (${DATA.taskTemplates.length} مهمة)`
              }]
            }]
          : []
      )
    ],

    onSave:async v=>{

      if(g){

        const row=await updateRow('task_groups',g.id,{
          name:v.name,
          description:v.description
        });

        Object.assign(g,mapGroup(row));

        toast('تم حفظ التعديل');

      }else{

        const row=await sb(
          db()
          .from('task_groups')
          .insert({name:v.name,description:v.description})
          .select()
          .single()
        );

        DATA.groups.push(mapGroup(row));

        let made=0;

        if((v.useTemplate||[]).includes('1')){
          made=await createTasksFromTemplate(row.id);
        }

        toast(
          made
            ? `تمت إضافة المجموعة مع ${made} مهمة من القالب`
            : 'تمت إضافة المجموعة'
        );
      }

      renderAdmin();
    }
  });
}

async function deleteGroup(id){

  const g=getGroup(id);

  if(!g) return;

  const n=groupTasks(id).length;

  if(!confirm(
    `حذف مجموعة "${g.name}"${n?` وكل مهامها (${n})`:''}؟`
  )){
    return;
  }

  try{

    await sb(
      db().from('tasks').delete().eq('group_id',id)
    );

    await sb(
      db().from('task_groups').delete().eq('id',id)
    );

    DATA.tasks=
      DATA.tasks.filter(t=>t.groupId!==id);

    DATA.groups=
      DATA.groups.filter(x=>x.id!==id);

    toast('تم حذف المجموعة');

    staffNav.admin.view='home';
    staffNav.admin.group=null;

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- إدارة الموظفين ---------- */

function renderStaffEmployeesAdmin(){

  return panel(
    'إدارة الموظفين',

    `
    <div class="toolbar">

      <button
        class="btn ghost small"
        onclick="openStaffView('home')">
        ${icon('back')} رجوع للمجموعات
      </button>

    </div>

    <div class="notice">

      عند إضافة موظف يتم توليد كود دخول خاص به تلقائيًا.
      أعطه اسمه والكود ليدخل من الصفحة الرئيسية (خانة
      "الموظف/ـة") ويرى لوحة المهام ويحدّث حالتها.

    </div>

    <form
      onsubmit="addEmployee(event)"
      class="form-grid">

      <input
        id="employeeName"
        class="input"
        placeholder="اسم الموظف/ـة"
        required>

      <input
        id="employeeJob"
        class="input"
        placeholder="المسمى الوظيفي (اختياري)">

      <input
        id="employeePhone"
        class="input"
        placeholder="رقم الجوال (اختياري)">

      <select
        id="employeeRole"
        class="input">

        <option value="0">موظف</option>

        <option
          value="1"
          ${hasCeo()?'disabled':''}>
          مدير الأكاديمية${hasCeo()?' (موجود)':''}
        </option>

      </select>

      <button class="btn primary">
        إضافة موظف
      </button>

    </form>

    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>الاسم</th>
            <th>المسمى</th>
            <th>الجوال</th>
            <th>كود الدخول</th>
            <th>المهام</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${
            DATA.employees.length
            ? DATA.employees.map(e=>{

                const mine=
                  taskCounts(
                    DATA.tasks.filter(
                      t=>t.employeeIds.includes(e.id)
                    )
                  );

                return `
                  <tr>

                    <td>${e.isCeo?'<span class="ceo-dot"></span>':''}${esc(e.name)}${e.isCeo?' <span class="assignee-tag ceo">مدير الأكاديمية</span>':''}</td>

                    <td>${esc(e.jobTitle||'-')}</td>

                    <td>${esc(e.phone||'-')}</td>

                    <td class="ltr">
                      <strong>${esc(e.loginCode||'-')}</strong>
                    </td>

                    <td>
                      ${mine.done}/${mine.total} تمت
                    </td>

                    <td style="display:flex;gap:6px;flex-wrap:wrap;">

                      <button
                        class="btn ghost small"
                        onclick="editEmployee('${e.id}')">
                        تعديل
                      </button>

                      <button
                        class="btn ghost small"
                        onclick="regenerateEmployeeCode('${e.id}')">
                        كود جديد
                      </button>

                      <button
                        class="btn danger small"
                        onclick="deleteEmployee('${e.id}')">
                        حذف
                      </button>

                    </td>

                  </tr>
                `;
              }).join('')
            : `
              <tr>
                <td colspan="6">
                  لا يوجد موظفون حتى الآن.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
    `
  );
}

function editEmployee(id){

  const e=getEmployee(id);

  if(!e) return;

  openEditModal({

    title:'تعديل الموظف',

    fields:[
      {key:'name',label:'الاسم',value:e.name,required:true},
      {key:'jobTitle',label:'المسمى الوظيفي',value:e.jobTitle},
      {key:'shortName',label:'الاسم المختصر (يظهر في المهام والتقارير)',
        value:(DATA.evalSettings.employeeShortNames||{})[e.id]||shortName(e)},
      {key:'phone',label:'الجوال',value:e.phone},
      {key:'isCeo',label:'الصفة',type:'select',value:e.isCeo?'1':'0',
        options:[
          {value:'0',label:'موظف'},
          {value:'1',label:'مدير الأكاديمية'}
        ]}
    ],

    onSave:async v=>{

      if(
        v.isCeo==='1' &&
        DATA.employees.some(x=>x.isCeo && x.id!==id)
      ){
        throw new Error('يوجد رئيس تنفيذي بالفعل، شخص واحد فقط.');
      }

      const row=await updateRow('employees',id,{
        name:v.name,
        job_title:v.jobTitle,
        phone:v.phone,
        is_ceo:v.isCeo==='1'
      });

      Object.assign(e,mapEmployee(row));

      if(!DATA.evalSettings.employeeShortNames)
        DATA.evalSettings.employeeShortNames={};
      DATA.evalSettings.employeeShortNames[e.id]=v.shortName.trim();
      evSaveSetting('employee_short_names').catch(()=>{});

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

async function addEmployee(e){

  e.preventDefault();

  try{

    const row=await sb(
      db()
      .from('employees')
      .insert({
        name:$('employeeName').value.trim(),
        job_title:$('employeeJob').value.trim(),
        phone:$('employeePhone').value.trim(),
        is_ceo:$('employeeRole')?.value==='1',
        login_code:genTeacherCode()
      })
      .select()
      .single()
    );

    DATA.employees.push(mapEmployee(row));

    toast(
      `تمت إضافة الموظف — كود الدخول: ${row.login_code}`
    );

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function regenerateEmployeeCode(id){

  if(!confirm(
    'توليد كود دخول جديد لهذا الموظف؟ سيتوقف الكود القديم عن العمل فورًا.'
  )){
    return;
  }

  try{

    const row=await updateRow('employees',id,{
      login_code:genTeacherCode()
    });

    const emp=getEmployee(id);

    if(emp){
      emp.loginCode=row.login_code;
    }

    toast(`الكود الجديد: ${row.login_code}`);

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function deleteEmployee(id){

  if(!confirm(
    'حذف هذا الموظف؟ سيُزال من المهام المشترك فيها (المهام نفسها تبقى).'
  )){
    return;
  }

  try{

    const affected=
      DATA.tasks.filter(t=>t.employeeIds.includes(id));

    for(const t of affected){

      const row=await updateRow('tasks',t.id,{
        employee_ids:t.employeeIds.filter(x=>x!==id)
      });

      DATA.tasks=
        DATA.tasks.map(x=>x.id===t.id?mapTask(row):x);
    }

    await sb(
      db()
      .from('employees')
      .delete()
      .eq('id',id)
    );

    DATA.employees=
      DATA.employees.filter(x=>x.id!==id);

    toast('تم حذف الموظف');

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- حذف جماعي للمهام ---------- */

async function clearStaffData(mode){

  const total=DATA.tasks.length;
  const done=DATA.tasks.filter(t=>t.status==='done').length;

  if(mode==='done'){

    if(!done){
      toast('لا توجد مهام منتهية.');
      return;
    }

    if(!confirm(`حذف ${done} مهمة منتهية؟`)) return;

  }else{

    const what=
      mode==='everything'
        ? `كل المجموعات (${DATA.groups.length}) والموظفين (${DATA.employees.length}) والمهام (${total})`
        : `كل المهام (${total})`;

    if(
      mode==='all' && !total ||
      mode==='everything' &&
        !total && !DATA.employees.length && !DATA.groups.length
    ){
      toast('لا توجد بيانات للحذف.');
      return;
    }

    if(!confirm(`سيتم حذف ${what} نهائيًا. هل أنت متأكد؟`)) return;

    if(prompt('للتأكيد اكتب كلمة: حذف')!=='حذف'){
      toast('تم إلغاء الحذف.');
      return;
    }
  }

  try{

    if(mode==='done'){

      await sb(
        db().from('tasks').delete().eq('status','done')
      );

      DATA.tasks=
        DATA.tasks.filter(t=>t.status!=='done');

    }else{

      await sb(
        db().from('tasks').delete().neq('id',NIL_UUID)
      );

      DATA.tasks=[];

      if(mode==='everything'){

        await sb(
          db().from('task_groups').delete().neq('id',NIL_UUID)
        );

        await sb(
          db().from('employees').delete().neq('id',NIL_UUID)
        );

        DATA.groups=[];
        DATA.employees=[];

        staffNav.admin.view='home';
        staffNav.admin.group=null;
        staffDraft=[];
        staffDraftDue='';
      }
    }

    toast('تم الحذف');

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* ---------- لوحة الموظف ---------- */

function renderEmployeeNav(){

  const n=$('employeeNav');

  if(!n) return;

  n.innerHTML=navButton(
    'tasks',
    'لوحة المهام',
    employeeTab==='tasks',
    "employeeTab='tasks';staffNav.employee.view='home';renderEmployee()"
  )+sideCreditHtml();
}

function renderEmployee(){

  renderHeaderActions();
  renderEmployeeNav();

  const m=$('employeeMain');

  if(!m) return;

  m.innerHTML=renderStaffRoute(false);
}

/* =========================================================
   نافذة التعديل الموحّدة + تعديل بقية الأقسام
   ========================================================= */

async function updateRow(table,id,payload){

  const rows=await sb(
    db()
    .from(table)
    .update(payload)
    .eq('id',id)
    .select()
  );

  if(!rows || !rows.length){

    throw new Error(
      'لم يتم حفظ التعديل — شغّل ملف v2_setup.sql في Supabase ثم أعد المحاولة.'
    );
  }

  return rows[0];
}

function modalFieldHtml(f){

  const v=f.value==null?'':String(f.value);

  const label=
    `<label class="modal-label">${esc(f.label)}</label>`;

  if(f.type==='textarea'){

    return `
      <div class="field">
        ${label}
        <textarea
          name="${f.key}"
          class="input"
          rows="${f.rows||3}"
          ${f.required?'required':''}>${esc(v)}</textarea>
      </div>
    `;
  }

  if(f.type==='select'){

    return `
      <div class="field">
        ${label}
        <select name="${f.key}" class="input">
          ${f.options.map(o=>`
            <option
              value="${esc(String(o.value))}"
              ${String(o.value)===v?'selected':''}>
              ${esc(o.label)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  if(f.type==='checkboxes'){

    const picked=f.value||[];

    return `
      <div class="field">

        ${label}

        <div class="assignee-grid">

          ${
            f.options.length
            ? f.options.map(o=>`
                <label class="assignee-chip">
                  <input
                    type="checkbox"
                    name="${f.key}"
                    value="${esc(String(o.value))}"
                    ${picked.includes(o.value)?'checked':''}>
                  <span>${esc(o.label)}</span>
                </label>
              `).join('')
            : '<span class="hint">لا يوجد موظفون بعد.</span>'
          }

        </div>

        <div style="display:flex;gap:6px;margin-top:8px;">

          <button
            type="button"
            class="btn ghost small"
            onclick="this.closest('.field').querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=true;})">
            تحديد الكل
          </button>

          <button
            type="button"
            class="btn ghost small"
            onclick="this.closest('.field').querySelectorAll('input[type=checkbox]').forEach(c=>{c.checked=false;})">
            إلغاء التحديد
          </button>

        </div>

      </div>
    `;
  }

  return `
    <div class="field">
      ${label}
      <input
        name="${f.key}"
        type="${f.type||'text'}"
        class="input"
        value="${esc(v)}"
        ${f.min!=null?`min="${f.min}"`:''}
        ${f.required?'required':''}>
    </div>
  `;
}

function openEditModal(cfg){

  closeEditModal();

  const wrap=document.createElement('div');

  wrap.id='editModal';
  wrap.className='modal-backdrop';

  wrap.innerHTML=`

    <div class="modal-box" role="dialog">

      <h3>${esc(cfg.title)}</h3>

      <form id="editModalForm">

        ${cfg.fields.map(modalFieldHtml).join('')}

        <div class="modal-actions">

          <button
            type="submit"
            class="btn primary">
            ${esc(cfg.saveLabel||'حفظ')}
          </button>

          <button
            type="button"
            class="btn ghost"
            onclick="closeEditModal()">
            إلغاء
          </button>

        </div>

      </form>

    </div>

  `;

  wrap.addEventListener('mousedown',e=>{

    if(e.target===wrap){
      closeEditModal();
    }
  });

  document.body.appendChild(wrap);

  const form=wrap.querySelector('form');

  form.addEventListener('submit',async ev=>{

    ev.preventDefault();

    const fd=new FormData(form);

    const vals={};

    cfg.fields.forEach(f=>{

      vals[f.key]=
        f.type==='checkboxes'
          ? fd.getAll(f.key)
          : String(fd.get(f.key)??'').trim();
    });

    const btn=form.querySelector('button[type=submit]');

    btn.disabled=true;

    try{

      await cfg.onSave(vals);

      closeEditModal();

    }catch(x){

      btn.disabled=false;

      toast(friendlyError(x),true);
    }
  });

  wrap.querySelector('input,textarea,select')?.focus();
}

function closeEditModal(){

  document.getElementById('editModal')?.remove();
}

document.addEventListener('keydown',e=>{

  if(e.key==='Escape'){
    closeEditModal();
  }
});

/* ---------- القاعات ---------- */

function editRoom(id){

  const r=getRoom(id);

  if(!r) return;

  openEditModal({

    title:'تعديل القاعة',

    fields:[
      {key:'name',label:'اسم القاعة',value:r.name,required:true},
      {key:'course',label:'الدورة / المستوى',value:r.course},
      {key:'groupName',label:'اسم المجموعة',value:r.groupName},
      {key:'duration',label:'مدة الدورة',type:'number',min:1,value:durationFields(r).value},
      {key:'durationUnit',label:'وحدة المدة',type:'select',value:durationFields(r).unit,
        options:[{value:'days',label:'أيام'},{value:'weeks',label:'أسابيع'}]},
      {key:'teacherId',label:'المعلم',type:'select',value:r.teacherId||'',
        options:[
          {value:'',label:'بدون معلم'},
          ...DATA.teachers.map(t=>({value:t.id,label:t.name}))
        ]}
    ],

    onSave:async v=>{

      const row=await updateRow('rooms',id,{
        name:v.name,
        course:v.course,
        group_name:v.groupName,
        duration_days:toDays(v.duration,v.durationUnit),
        duration_weeks:
          toDays(v.duration,v.durationUnit)
            ? Math.ceil(toDays(v.duration,v.durationUnit)/7)
            : null,
        teacher_id:v.teacherId||null
      });

      Object.assign(r,mapRoom(row));

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* ---------- المعلمون ---------- */

function editTeacher(id){

  const t=getTeacher(id);

  if(!t) return;

  openEditModal({

    title:'تعديل المعلم',

    fields:[
      {key:'name',label:'الاسم',value:t.name,required:true},
      {key:'phone',label:'الجوال',value:t.phone},
      {key:'gender',label:'الفئة',type:'select',value:t.gender||'',
        options:[
          {value:'',label:'غير محدد'},
          {value:'m',label:'معلّم'},
          {value:'f',label:'معلّمة'}
        ]}
    ],

    onSave:async v=>{

      const row=await updateRow('teachers',id,{
        name:v.name,
        phone:v.phone,
        gender:v.gender||null
      });

      Object.assign(t,mapTeacher(row));

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* ---------- الطلاب ---------- */

function editStudent(id){

  const s=getStudent(id);

  if(!s) return;

  openEditModal({

    title:'تعديل الطالب',

    fields:[
      {key:'name',label:'الاسم',value:s.name,required:true},
      {key:'phone',label:'الجوال',value:s.phone},
      {key:'roomId',label:'القاعة',type:'select',value:s.roomId||'',
        options:[
          {value:'',label:'بدون قاعة'},
          ...DATA.rooms.map(r=>({value:r.id,label:r.name}))
        ]}
    ],

    onSave:async v=>{

      const row=await updateRow('students',id,{
        name:v.name,
        phone:v.phone,
        room_id:v.roomId||null
      });

      Object.assign(s,mapStudent(row));

      sortStudents();

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* ---------- الإعلانات ---------- */

function editAnnouncement(id){

  const a=DATA.announcements.find(x=>x.id===id);

  if(!a) return;

  openEditModal({

    title:'تعديل الإعلان',

    fields:[
      {key:'message',label:'نص الإعلان',type:'textarea',rows:5,value:a.text,required:true}
    ],

    onSave:async v=>{

      const row=await updateRow('announcements',id,{
        message:v.message
      });

      Object.assign(a,mapAnnouncement(row));

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* ---------- خصومات المعلمين ---------- */

function editDeduction(id){

  const d=DATA.teacherDeductions.find(x=>x.id===id);

  if(!d) return;

  openEditModal({

    title:'تعديل الخصم',

    fields:[
      {key:'reason',label:'السبب',value:d.reason,required:true},
      {key:'points',label:'عدد النقاط',type:'number',min:1,value:d.points,required:true}
    ],

    onSave:async v=>{

      const row=await updateRow('teacher_deductions',id,{
        reason:v.reason,
        amount:Number(v.points)
      });

      Object.assign(d,mapDeduction(row));

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* ---------- التقارير ---------- */

function editReport(id){

  const r=DATA.reports.find(x=>x.id===id);

  if(!r) return;

  openEditModal({

    title:'تعديل التقرير',

    fields:[
      {key:'week',label:'الأسبوع',value:r.week},
      {key:'content',label:'نص التقرير',type:'textarea',rows:6,value:r.content},
      {key:'driveLink',label:'رابط الملفات (اختياري)',value:r.driveLink}
    ],

    onSave:async v=>{

      const row=await updateRow('reports',id,{
        week:v.week,
        content:v.content,
        drive_link:v.driveLink
      });

      Object.assign(r,mapReport(row));

      toast('تم حفظ التعديل');

      renderAdmin();
    }
  });
}

/* =========================================================
   مدير الأكاديمية
   ========================================================= */

let currentIsCeo = false;
let currentCeoCode = '';
let ceoTab = 'tasks';
let ceoViewReportId = null;

function mapCeoReport(r){
  return {
    id:r.id,
    kind:r.kind||'eval',
    title:r.title||'',
    week:r.week,
    html:r.html||'',
    createdAt:r.created_at||''
  };
}

async function loadCeoInbox(){

  DATA.ceoReports=[];

  const isAdmin=
    currentAdmin || currentProfile?.role==='admin';

  if(!isAdmin && !currentIsCeo) return;

  try{

    const rows=await sb(
      db()
      .from('ceo_reports')
      .select('*')
      .order('created_at',{ascending:false})
    );

    DATA.ceoReports=(rows||[]).map(mapCeoReport);

  }catch(e){

    console.warn('تعذر تحميل تقارير مدير الأكاديمية:',e);
  }
}

/* ---------- الدخول ---------- */

async function ceoCodeLogin(){

  try{

    const code=$('ceoCodeInput')?.value.trim();

    if(!code){

      toast('أدخل كود الدخول.',true);
      return;
    }

    const row=await sb(
      db().rpc('verify_ceo_login',{
        p_code:code
      })
    );

    if(!row){

      toast('الكود غير صحيح.',true);
      return;
    }

    currentUser={employeeLogin:true,ceoLogin:true,name:row.name};
    currentProfile=null;
    currentAdmin=false;
    currentTeacherId=null;
    currentEmployeeId=row.id;
    currentIsCeo=true;
    currentCeoCode=code; // الكود الذي أدخله للتو - لا نقرأ login_code من القاعدة

    try{
      localStorage.setItem('saqifah:ceoSession',row.id);
    }catch{}

    await loadData();

    ceoTab='tasks';
    ceoViewReportId=null;
    staffNav.employee.view='home';

    showScreen('screen-ceo');

    renderCeo();

    toast('تم تسجيل الدخول بنجاح');

  }catch(e){

    toast(friendlyError(e),true);
  }
}

/* ---------- لوحة مدير الأكاديمية ---------- */

function renderCeoSeal(){

  const name=
    getEmployee(currentEmployeeId)?.name||currentUser?.name||'';

  return `

    <div class="ceo-banner">

      <div class="ceo-seal">
        <div class="ceo-seal__ring">
          <span class="ceo-seal__star">${icon('starFill',20)}</span>
          <b>مدير الأكاديمية</b>
          <small>تعلّم العربية</small>
        </div>
      </div>

      <div>
        <h2>${esc(name)}</h2>
        <p>مدير الأكاديمية — برنامج تعلّم العربية · السقيفة</p>
      </div>

    </div>

  `;
}

function renderCeoNav(){

  const n=$('ceoNav');

  if(!n) return;

  const count=
    DATA.ceoReports.length+
    DATA.reports.filter(r=>r.sentToCeo).length;

  n.innerHTML=
    navButton(
      'tasks',
      'لوحة المهام',
      ceoTab==='tasks',
      "ceoTab='tasks'+sideCreditHtml();staffNav.employee.view='home';renderCeo()"
    )+
    navButton(
      'reports',
      'التقارير'+(count?` (${count})`:''),
      ceoTab==='reports',
      "ceoTab='reports';ceoViewReportId=null;renderCeo()"
    )+
    navButton(
      'account',
      'حسابي',
      ceoTab==='account',
      "ceoTab='account';renderCeo()"
    );
}

function renderCeo(){

  renderHeaderActions();
  renderCeoNav();

  const m=$('ceoMain');

  if(!m) return;

  if(ceoTab==='reports'){
    m.innerHTML=renderCeoReports();
  }else if(ceoTab==='account'){
    m.innerHTML=renderCeoAccount();
  }else{
    m.innerHTML=renderCeoSeal()+renderStaffRoute(false);
  }
}

/* ---------- التقارير ---------- */

function renderCeoReports(){

  if(ceoViewReportId){

    const r=
      DATA.ceoReports.find(x=>x.id===ceoViewReportId);

    if(r){

      return panel(
        r.title,

        `
        <div class="toolbar">

          <button
            class="btn ghost small"
            onclick="ceoViewReportId=null;renderCeo()">
            ${icon('back')} رجوع للتقارير
          </button>

          <button
            class="btn primary small"
            onclick="ceoPrintReport('${r.id}')">
            ${icon('printer')} طباعة / حفظ PDF
          </button>

        </div>

        <div class="ceo-report-view">
          ${r.html}
        </div>
        `
      );
    }

    ceoViewReportId=null;
  }

  const teacherReports=
    DATA.reports
      .filter(r=>r.sentToCeo)
      .sort((a,b)=>
        String(b.date||'').localeCompare(String(a.date||''))
      );

  return panel(
    'التقارير',

    `
    <h3 style="color:var(--purple);margin-bottom:12px;">
      التقارير الأسبوعية لتقييم المعلمين والمعلمات
    </h3>

    ${
      DATA.ceoReports.length
      ? `
        <div class="report-list" style="margin-bottom:26px;">

          ${DATA.ceoReports.map(r=>`

            <div class="report-card">

              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">

                <div>
                  <h4>${esc(r.title)}</h4>
                  <small>
                    أُرسل في ${r.createdAt?fmtDate(r.createdAt):'-'}
                  </small>
                </div>

                <div style="display:flex;gap:6px;flex-wrap:wrap;">

                  <button
                    class="btn primary small"
                    onclick="ceoViewReportId='${r.id}';renderCeo()">
                    عرض التقرير
                  </button>

                  <button
                    class="btn ghost small"
                    onclick="ceoPrintReport('${r.id}')">
                    ${icon('printer')} طباعة / PDF
                  </button>

                </div>

              </div>

            </div>

          `).join('')}

        </div>
      `
      : '<div class="empty">لم يصلك أي تقرير أسبوعي بعد.</div>'
    }

    <h3 style="color:var(--purple);margin-bottom:12px;">
      تقارير المعلمين والمعلمات الأسبوعية
    </h3>

    ${
      teacherReports.length
      ? `
        <div class="report-list">

          ${teacherReports.map(r=>`

            <div class="report-card">

              <h4>
                ${esc(getTeacher(r.teacherId)?.name||'معلم')}
                — ${esc(getRoom(r.roomId)?.name||'')}
              </h4>

              <small>
                الأسبوع ${esc(r.week)}
                ${r.date?' · '+fmtDate(r.date):''}
              </small>

              <p style="white-space:pre-wrap;">${esc(r.content)}</p>

              ${
                r.images?.length
                ? `
                  <div class="report-images">
                    ${r.images.map(img=>`
                      <a href="${img}" target="_blank" rel="noopener">
                        <img src="${img}" alt="صورة التقرير" loading="lazy">
                      </a>
                    `).join('')}
                  </div>
                `
                : ''
              }

              ${
                r.driveLink
                ? `
                  <a
                    class="link"
                    href="${esc(r.driveLink)}"
                    target="_blank"
                    rel="noopener">
                    فتح ملفات التقرير
                  </a>
                `
                : ''
              }

            </div>

          `).join('')}

        </div>
      `
      : '<div class="empty">لا توجد تقارير معلمين مرسلة إليك بعد.</div>'
    }
    `
  );
}

function ceoPrintReport(id){

  const r=DATA.ceoReports.find(x=>x.id===id);

  if(!r) return;

  evPrint('report',r.title,r.html);
}

/* ---------- حسابي وتغيير الكود ---------- */

function renderCeoAccount(){

  return panel(
    'حسابي',

    `
    ${renderCeoSeal()}

    <div class="card-inner">

      <h3>كود الدخول</h3>

      <p style="margin-bottom:12px;font-size:14px;">
        كودك الحالي:
        <b class="ltr" style="letter-spacing:2px;">${esc(currentCeoCode||'-')}</b>
      </p>

      <button
        class="btn primary"
        onclick="openCeoCodeModal()">
        تغيير الكود
      </button>

    </div>
    `
  );
}

function openCeoCodeModal(){

  openEditModal({

    title:'تغيير كود الدخول',

    fields:[
      {key:'oldCode',label:'الكود الحالي',required:true},
      {key:'newCode',label:'الكود الجديد (4 أحرف أو أرقام على الأقل)',required:true},
      {key:'confirm',label:'أعد كتابة الكود الجديد',required:true}
    ],

    onSave:async v=>{

      const code=v.newCode.trim();

      if(code.length<4){
        throw new Error('الكود لازم يكون 4 أحرف أو أرقام على الأقل.');
      }

      if(code!==v.confirm.trim()){
        throw new Error('الكودان غير متطابقين.');
      }

      const ok=await sb(
        db().rpc('ceo_change_code',{
          old_code:v.oldCode.trim(),
          new_code:code
        })
      );

      if(!ok){
        throw new Error('تعذّر تغيير الكود، حاول مرة أخرى.');
      }

      currentCeoCode=code;

      toast('تم تغيير الكود — استخدم الكود الجديد في دخولك القادم.');

      renderCeo();
    }
  });
}

/* ---------- خيارات الإدارة: إرسال التقارير ---------- */

function hasCeo(){

  return DATA.employees.some(e=>e.isCeo);
}

function renderEvSentList(){

  const list=DATA.ceoReports.filter(r=>r.kind==='eval');

  if(!list.length) return '';

  return `
    <div class="notice">

      المُرسل لمدير الأكاديمية:

      ${list.map(r=>`
        <span class="assignee-tag">
          ${esc(r.title)}
          <a
            href="javascript:void(0)"
            style="margin-inline-start:6px;color:var(--red);font-weight:800;"
            onclick="evDeleteCeoReport('${r.id}')"
            title="إلغاء الإرسال">${icon('x',13)}</a>
        </span>
      `).join('')}

    </div>
  `;
}

async function evSendReportToCeo(){

  if(!hasCeo()){

    toast(
      'أضف مدير الأكاديمية أولاً من "الموظفون والمهام" ثم "إدارة الموظفين".',
      true
    );

    return;
  }

  const week=evReportWeek;

  const title=
    `التقرير الأسبوعي — الأسبوع ${week} — ${evCourseName()}`;

  const existing=
    DATA.ceoReports.find(r=>r.kind==='eval' && r.week===week);

  if(
    existing &&
    !confirm('يوجد تقرير مرسل لهذا الأسبوع، هل تريد استبداله بالنسخة الحالية؟')
  ){
    return;
  }

  try{

    const payload={
      kind:'eval',
      title,
      week,
      html:evReportHTML(week),
      created_at:new Date().toISOString()
    };

    const row=
      existing
        ? await updateRow('ceo_reports',existing.id,payload)
        : await sb(
            db().from('ceo_reports').insert(payload).select().single()
          );

    DATA.ceoReports=
      DATA.ceoReports.filter(r=>r.id!==row.id);

    DATA.ceoReports.unshift(mapCeoReport(row));

    toast('تم إرسال التقرير إلى مدير الأكاديمية');

    renderAdmin();

  }catch(x){

    toast(
      'تعذر الإرسال — تأكد من تشغيل v4_setup.sql. '+friendlyError(x),
      true
    );
  }
}

async function evDeleteCeoReport(id){

  if(!confirm('إلغاء إرسال هذا التقرير؟ سيختفي من لوحة مدير الأكاديمية.')) return;

  try{

    await sb(
      db().from('ceo_reports').delete().eq('id',id)
    );

    DATA.ceoReports=
      DATA.ceoReports.filter(r=>r.id!==id);

    toast('تم إلغاء الإرسال');

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function toggleReportCeo(id){

  const r=DATA.reports.find(x=>x.id===id);

  if(!r) return;

  if(!r.sentToCeo && !hasCeo()){

    toast(
      'أضف مدير الأكاديمية أولاً من "الموظفون والمهام" ثم "إدارة الموظفين".',
      true
    );

    return;
  }

  try{

    const row=await updateRow('reports',id,{
      sent_to_ceo:!r.sentToCeo
    });

    Object.assign(r,mapReport(row));

    toast(
      r.sentToCeo
        ? 'تم إرسال التقرير إلى مدير الأكاديمية'
        : 'تم إلغاء الإرسال'
    );

    renderAdmin();

  }catch(x){

    toast(
      'تعذر الحفظ — تأكد من تشغيل v4_setup.sql. '+friendlyError(x),
      true
    );
  }
}

/* =========================================================
   تحسينات الجوال (جداول بطاقات + تمرير القائمة)
   ========================================================= */

function enhanceTables(root){

  (root||document).querySelectorAll(
    '.main-panel table:not(.score-table):not(.report__table)'
  ).forEach(t=>{

    const heads=
      Array.from(t.querySelectorAll('thead th'))
        .map(th=>th.textContent.replace(/\s+/g,' ').trim());

    if(!heads.length) return;

    t.classList.add('rt');

    t.querySelectorAll('tbody tr').forEach(tr=>{

      Array.from(tr.children).forEach((td,i)=>{

        if(td.hasAttribute('colspan')) return;

        if(td.dataset.label===undefined || td.dataset.label!==(heads[i]||'')){
          td.dataset.label=heads[i]||'';
        }
      });
    });
  });
}

function keepNavVisible(){

  if(window.innerWidth>700) return;

  const btn=
    document.querySelector('.screen.active .sidebar .nav-btn.active');

  btn?.scrollIntoView({inline:'center',block:'nearest'});
}

function syncHeaderHeight(){

  const h=document.querySelector('.app-header');

  if(h){
    document.documentElement.style.setProperty(
      '--hdr',h.offsetHeight+'px'
    );
  }
}

(function initMobileEnhancements(){

  let queued=false;

  const run=()=>{

    queued=false;

    enhanceTables();
    keepNavVisible();
  };

  const queue=()=>{

    if(queued) return;

    queued=true;

    requestAnimationFrame(run);
  };

  if(typeof MutationObserver!=='undefined'){

    const obs=new MutationObserver(queue);

    ['adminMain','teacherMain','employeeMain','ceoMain'].forEach(id=>{

      const el=document.getElementById(id);

      if(el){
        obs.observe(el,{childList:true,subtree:true});
      }
    });

    ['adminNav','teacherNav','employeeNav','ceoNav'].forEach(id=>{

      const el=document.getElementById(id);

      if(el){
        obs.observe(el,{childList:true});
      }
    });
  }

  window.addEventListener('resize',syncHeaderHeight);
  window.addEventListener('load',syncHeaderHeight);

  syncHeaderHeight();
})();

/* =========================================================
   تصدير Excel لكل الأقسام + تقرير المهام PDF + قالب المهام
   ========================================================= */

const PANEL_EXPORTS = {
  'القاعات والدورات':'exportRoomsExcel()',
  'المعلمون والمعلمات':'exportTeachersListExcel()',
  'الطلاب':'exportStudentsExcel()',
  'التقارير الأسبوعية':'exportReportsExcel()',
  'الإعلانات':'exportAnnouncementsExcel()',
  'تقييم المعلمين والمعلمات':'exportTeachersExcel()'
};

function panel(title,body){

  const exp=currentAdmin?PANEL_EXPORTS[title]:null;

  return `
    <div class="section-head">
      <h2>${title}</h2>
      ${
        exp
        ? `<button class="btn ghost small" onclick="${exp}">${icon('download')} تصدير Excel</button>`
        : ''
      }
    </div>

    ${body}
  `;
}

function fmtDuration(days){

  const d=Number(days)||0;

  if(!d) return '-';

  if(d<7) return `${d} ${d===1?'يوم':d===2?'يومان':'أيام'}`;

  const w=Math.floor(d/7);
  const r=d%7;

  return r
    ? `${w} أسبوع و${r} ${r===1?'يوم':'أيام'}`
    : `${w} أسبوع`;
}

function durationFields(room){

  const d=room?.durationDays||0;

  const inWeeks=d>0 && d%7===0;

  return {
    value:d?(inWeeks?d/7:d):'',
    unit:inWeeks?'weeks':'days'
  };
}

function toDays(value,unit){

  const n=Number(value)||0;

  if(!n) return null;

  return unit==='weeks'?n*7:n;
}

function xlsxOut(sheets,name){

  const empty=
    Object.values(sheets).every(r=>!r.length);

  if(empty){

    toast('لا توجد بيانات لتصديرها.',true);
    return;
  }

  downloadWorkbook(
    sheets,
    `${name}-${new Date().toISOString().slice(0,10)}.xlsx`
  );

  toast('تم تصدير الملف');
}

function exportRoomsExcel(){

  xlsxOut({
    'القاعات':DATA.rooms.map(r=>({
      'القاعة':r.name,
      'الدورة':r.course,
      'اسم المجموعة':r.groupName,
      'المدة':fmtDuration(r.durationDays),
      'المعلم':getTeacher(r.teacherId)?.name||'',
      'عدد الطلاب':DATA.students.filter(s=>s.roomId===r.id).length
    }))
  },'القاعات-والدورات');
}

function exportTeachersListExcel(){

  xlsxOut({
    'المعلمون':DATA.teachers.map(t=>({
      'الاسم':t.name,
      'الفئة':t.gender==='f'?'معلّمة':t.gender==='m'?'معلّم':'',
      'الجوال':t.phone,
      'كود الدخول':t.loginCode,
      'القاعات':DATA.rooms
        .filter(r=>r.teacherId===t.id)
        .map(r=>r.name).join('، ')
    }))
  },'المعلمون');
}

function exportStudentsExcel(){

  xlsxOut({
    'الطلاب':DATA.students.map(s=>{

      const room=getRoom(s.roomId);

      return {
        'الطالب':s.name,
        'الجوال':s.phone,
        'القاعة':room?.name||'',
        'اسم المجموعة':room?.groupName||'',
        'المعلم':getTeacher(room?.teacherId)?.name||''
      };
    })
  },'الطلاب');
}

function exportReportsExcel(){

  xlsxOut({
    'التقارير':DATA.reports.map(r=>({
      'المعلم':getTeacher(r.teacherId)?.name||'',
      'القاعة':getRoom(r.roomId)?.name||'',
      'الأسبوع':r.week||'',
      'محتوى التقرير':r.content||'',
      'رابط Google Drive':r.driveLink||'',
      'عدد الصور':r.images?.length||0,
      'مُرسل لمدير الأكاديمية':r.sentToCeo?'نعم':'لا',
      'التاريخ':r.date?fmtDate(r.date):''
    }))
  },'التقارير-الأسبوعية');
}

function exportAnnouncementsExcel(){

  xlsxOut({
    'الإعلانات':DATA.announcements.map(a=>({
      'النص':a.text,
      'التاريخ':a.date?fmtDate(a.date):''
    }))
  },'الإعلانات');
}

function exportDeductionsExcel(){

  xlsxOut({
    'الخصومات':DATA.teacherDeductions.map(d=>({
      'المعلم':getTeacher(d.teacherId)?.name||'',
      'السبب':d.reason,
      'النقاط':d.points,
      'التاريخ':d.date?fmtDate(d.date):''
    }))
  },'خصومات-المعلمين');
}

function taskRows(list){

  return list.map(t=>({
    'المجموعة':t.groupId?(getGroup(t.groupId)?.name||''):'مهام عامة',
    'المهمة':t.title,
    'التفاصيل':splitTaskDesc(t).desc,
    'ملاحظات المدير':splitTaskDesc(t).adminNote,
    'المسند إليهم':
      t.employeeIds
        .map(id=>getEmployee(id)?.name)
        .filter(Boolean).join('، ')||'غير مسندة',
    'الاستحقاق':t.dueDate?fmtDate(t.dueDate):'',
    'الحالة':taskStatusLabel(t.status),
    'آخر تحديث بواسطة':t.updatedBy,
    'ملاحظة':t.employeeNote
  }));
}

function exportTasksExcel(groupId){

  if(groupId==='all'){

    xlsxOut({
      'المهام':taskRows(DATA.tasks),
      'المجموعات':[
        ...DATA.groups.map(g=>({g,list:groupTasks(g.id)})),
        {g:{name:'مهام عامة'},list:groupTasks(null)}
      ].map(({g,list})=>({
        'المجموعة':g.name,
        'عدد المهام':list.length,
        'تمت':list.filter(t=>t.status==='done').length,
        'قيد العمل':list.filter(t=>t.status==='doing').length,
        'لم تتم':list.filter(t=>t.status==='todo').length,
        'نسبة الإنجاز':donePercent(list)+'%'
      })),
      'الموظفون':DATA.employees.map(e=>{

        const mine=DATA.tasks.filter(t=>t.employeeIds.includes(e.id));

        return {
          'الاسم':e.name,
          'الصفة':e.isCeo?'مدير الأكاديمية':(e.jobTitle||'موظف'),
          'عدد المهام':mine.length,
          'تمت':mine.filter(t=>t.status==='done').length,
          'نسبة الإنجاز':donePercent(mine)+'%'
        };
      })
    },'المهام-والموظفون');

    return;
  }

  const gid=groupId||null;

  const name=gid?(getGroup(gid)?.name||'مجموعة'):'مهام-عامة';

  xlsxOut(
    {'المهام':taskRows(groupTasks(gid))},
    `مهام-${name}`
  );
}

/* ---------- تقرير المهام PDF ---------- */

function taskReportTable(tasks){

  return `
    <div class="report__tablewrap">

      <table class="report__table">

        <thead>
          <tr>
            <th>م</th>
            <th>المهمة</th>
            <th>المسند إليهم</th>
            <th>الاستحقاق</th>
            <th>الحالة</th>
            <th>آخر تحديث</th>
            <th>ملاحظات</th>
          </tr>
        </thead>

        <tbody>

          ${
            tasks.length
            ? tasks.map((t,i)=>`
                <tr>
                  <td>${i+1}</td>
                  <td class="nm">
                    ${esc(taskDisplayTitle(t))}
                    ${splitTaskDesc(t).desc?`<br><small style="font-weight:500;opacity:.75;">${esc(splitTaskDesc(t).desc)}</small>`:''}${splitTaskDesc(t).adminNote?`<br><small style="font-weight:700;color:#b91c1c;">ملاحظات المدير: ${esc(splitTaskDesc(t).adminNote)}</small>`:''}
                  </td>
                  <td>${esc(t.employeeIds.map(id=>shortName(getEmployee(id))).filter(Boolean).join('، ')||'—')}</td>
                  <td>${t.dueDate?fmtDate(t.dueDate):'—'}</td>
                  <td class="st-${t.status}">${taskStatusLabel(t.status)}</td>
                  <td>${esc(t.updatedBy||'—')}</td>
                  <td>${esc(t.employeeNote||'—')}</td>
                </tr>
              `).join('')
            : '<tr><td colspan="7">لا توجد مهام.</td></tr>'
          }

        </tbody>

      </table>

    </div>
  `;
}

function taskReportHTML(sections,title){

  const {hijri,greg}=evTodayStrings();

  const all=sections.flatMap(s=>s.tasks);

  const c=taskCounts(all);

  return `

  <div class="report" id="report">

    <div class="report__head">
      <img src="${EV_LOGO_PROGRAM}" alt="" class="report__logo report__logo--program">
      <div class="report__titlebox">
        <h1 class="report__title">${esc(title)}</h1>
        <div class="report__sub">برنامج «تعلّم العربية» — السقيفة</div>
      </div>
      <img src="${EV_LOGO_ORG}" alt="" class="report__logo report__logo--org">
    </div>

    <div class="report__meta">
      <div>عدد المجموعات: <b>${sections.length}</b></div>
      <div>نسبة الإنجاز: <b>${donePercent(all)}%</b></div>
      <div>تاريخ التقرير: <b>${hijri} هـ</b> — الموافق ${greg} م</div>
    </div>

    <div class="report__summary">
      <div class="report__stat"><span>إجمالي المهام</span><b>${c.total}</b></div>
      <div class="report__stat"><span>تمت</span><b>${c.done}</b></div>
      <div class="report__stat"><span>قيد العمل</span><b>${c.doing}</b></div>
      <div class="report__stat"><span>لم تتم</span><b>${c.todo}</b></div>
    </div>

    ${sections.map(s=>{

      const sc=taskCounts(s.tasks);

      return `
        <div class="task-section">
          <h3 class="task-section__title">
            ${esc(s.name)}
            <small>${sc.done} من ${sc.total} تمت — ${donePercent(s.tasks)}%</small>
          </h3>
          ${taskReportTable(s.tasks)}
        </div>
      `;
    }).join('')}

    <div class="report__foot">
      <div class="report__sig"><span>إعداد التقرير</span><div class="line"></div><b>&nbsp;</b></div>
      <div class="report__sig"><span>الاعتماد</span><div class="line"></div><b>&nbsp;</b></div>
    </div>

  </div>
  `;
}

function printTasksReport(groupId){

  if(groupId==='all'){

    const sections=[
      ...DATA.groups.map(g=>({name:g.name,tasks:groupTasks(g.id)})),
      {name:'مهام عامة',tasks:groupTasks(null)}
    ].filter(s=>s.tasks.length);

    if(!sections.length){

      toast('لا توجد مهام لطباعة تقرير عنها.',true);
      return;
    }

    evPrint(
      'report',
      'تقرير المهام الشامل',
      taskReportHTML(sections,'تقرير المهام الشامل')
    );

    return;
  }

  const gid=groupId||null;

  const name=gid?(getGroup(gid)?.name||'مجموعة'):'مهام عامة';

  const tasks=groupTasks(gid);

  if(!tasks.length){

    toast('لا توجد مهام في هذه المجموعة.',true);
    return;
  }

  evPrint(
    'report',
    `تقرير المهام - ${name}`,
    taskReportHTML([{name,tasks}],`تقرير المهام — ${name}`)
  );
}

/* ---------- قالب المهام ---------- */

function mapTemplate(r){

  return {
    id:r.id,
    title:r.title||'',
    description:r.description||'',
    employeeIds:Array.isArray(r.employee_ids)?r.employee_ids:[]
  };
}

function renderStaffTemplates(){

  return panel(
    'قالب المهام',

    `
    <div class="toolbar">

      <button
        class="btn ghost small"
        onclick="openStaffView('home')">
        ${icon('back')} رجوع للمجموعات
      </button>

      <button
        class="btn secondary small"
        onclick="openTemplateModal()">
        ${icon('plus')} إضافة مهمة للقالب
      </button>

    </div>

    <div class="notice">

      هذي المهام المشتركة بين كل المجموعات. تُضاف تلقائيًا لأي مجموعة
      جديدة تنشئها، وتقدر بعدها تضيف وتحذف وتعدّل داخل المجموعة نفسها
      بدون ما يتأثر القالب. تقدر أيضًا تحدد موظفين افتراضيين لكل مهمة.

    </div>

    <div class="card-inner">

      <h3>إضافة عدة مهام للقالب دفعة واحدة</h3>

      <div class="form-grid">

        <textarea
          id="templateLines"
          class="input"
          rows="5"
          placeholder="المهمة الأولى&#10;المهمة الثانية&#10;المهمة الثالثة"></textarea>

        <button
          type="button"
          class="btn primary"
          onclick="addTemplateLines()">
          إضافة للقالب
        </button>

      </div>

    </div>

    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>المهمة</th>
            <th>المسند إليهم افتراضيًا</th>
            <th></th>
          </tr>
        </thead>

        <tbody>

          ${
            DATA.taskTemplates.length
            ? DATA.taskTemplates.map(t=>`

                <tr>

                  <td>
                    <b>${esc(t.title)}</b>
                    ${t.description?`<div class="hint" style="text-align:right;margin-top:4px;">${esc(t.description)}</div>`:''}
                  </td>

                  <td>
                    ${
                      t.employeeIds
                        .map(id=>getEmployee(id)?.name)
                        .filter(Boolean)
                        .map(n=>`<span class="assignee-tag">${esc(n)}</span>`)
                        .join('')||'-'
                    }
                  </td>

                  <td style="display:flex;gap:6px;flex-wrap:wrap;">

                    <button
                      class="btn ghost small"
                      onclick="openTemplateModal('${t.id}')">
                      تعديل
                    </button>

                    <button
                      class="btn danger small"
                      onclick="deleteTemplate('${t.id}')">
                      حذف
                    </button>

                  </td>

                </tr>

              `).join('')
            : `
              <tr>
                <td colspan="3">القالب فارغ. أضف المهام المتكررة هنا.</td>
              </tr>
            `
          }

        </tbody>

      </table>

    </div>
    `
  );
}

async function addTemplateLines(){

  const lines=
    ($('templateLines')?.value||'')
      .split('\n').map(l=>l.trim()).filter(Boolean);

  if(!lines.length){

    toast('اكتب مهمة واحدة على الأقل.',true);
    return;
  }

  try{

    const rows=await sb(
      db()
      .from('task_templates')
      .insert(lines.map(title=>({title})))
      .select()
    );

    (rows||[]).forEach(r=>DATA.taskTemplates.push(mapTemplate(r)));

    toast(`تمت إضافة ${lines.length} مهمة للقالب`);

    renderAdmin();

  }catch(x){

    toast(
      'تعذر الحفظ — تأكد من تشغيل v5_setup.sql. '+friendlyError(x),
      true
    );
  }
}

function openTemplateModal(id){

  const t=id?DATA.taskTemplates.find(x=>x.id===id):null;

  openEditModal({

    title:t?'تعديل مهمة القالب':'إضافة مهمة للقالب',

    fields:[
      {key:'title',label:'المهمة',value:t?.title||'',required:true},
      {key:'description',label:'التفاصيل (اختياري)',type:'textarea',value:t?.description||''},
      {key:'employeeIds',label:'المسند إليهم افتراضيًا (اختياري)',type:'checkboxes',
        value:t?.employeeIds||[],
        options:DATA.employees.map(e=>({value:e.id,label:e.name}))}
    ],

    onSave:async v=>{

      const payload={
        title:v.title,
        description:v.description,
        employee_ids:v.employeeIds
      };

      if(t){

        const row=await updateRow('task_templates',t.id,payload);

        DATA.taskTemplates=
          DATA.taskTemplates.map(x=>x.id===t.id?mapTemplate(row):x);

      }else{

        const row=await sb(
          db().from('task_templates').insert(payload).select().single()
        );

        DATA.taskTemplates.push(mapTemplate(row));
      }

      toast('تم الحفظ');

      renderAdmin();
    }
  });
}

async function deleteTemplate(id){

  if(!confirm('حذف هذه المهمة من القالب؟ (المجموعات الحالية لا تتأثر)')) return;

  try{

    await sb(
      db().from('task_templates').delete().eq('id',id)
    );

    DATA.taskTemplates=
      DATA.taskTemplates.filter(t=>t.id!==id);

    toast('تم الحذف');

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function createTasksFromTemplate(groupId){

  const existing=
    new Set(groupTasks(groupId).map(t=>t.title.trim()));

  const rows=
    DATA.taskTemplates
      .filter(t=>!existing.has(t.title.trim()))
      .map(t=>({
        group_id:groupId,
        title:t.title,
        description:t.description,
        status:'doing',
        employee_ids:t.employeeIds.filter(id=>getEmployee(id))
      }));

  if(!rows.length) return 0;

  const inserted=await sb(
    db().from('tasks').insert(rows).select()
  );

  (inserted||[])
    .map(mapTask)
    .reverse()
    .forEach(t=>DATA.tasks.unshift(t));

  return rows.length;
}

async function applyTemplateToGroup(groupId){

  if(!DATA.taskTemplates.length){

    toast('القالب فارغ، أضف مهامه أولاً من "قالب المهام".',true);
    return;
  }

  try{

    const n=await createTasksFromTemplate(groupId);

    toast(
      n?`تمت إضافة ${n} مهمة من القالب`
       :'كل مهام القالب موجودة في المجموعة بالفعل.'
    );

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

async function saveGroupAsTemplate(groupId){

  const have=
    new Set(DATA.taskTemplates.map(t=>t.title.trim()));

  const rows=
    groupTasks(groupId)
      .filter(t=>!have.has(t.title.trim()))
      .map(t=>({title:t.title,description:t.description}));

  if(!rows.length){

    toast('كل مهام هذي المجموعة موجودة في القالب أصلًا.');
    return;
  }

  if(!confirm(`إضافة ${rows.length} مهمة من هذي المجموعة إلى القالب؟`)) return;

  try{

    const inserted=await sb(
      db().from('task_templates').insert(rows).select()
    );

    (inserted||[]).forEach(r=>DATA.taskTemplates.push(mapTemplate(r)));

    toast(`تمت إضافة ${rows.length} مهمة للقالب`);

    renderAdmin();

  }catch(x){

    toast(friendlyError(x),true);
  }
}

/* =========================================================
   حذف البيانات القديمة (الإعدادات)
   ========================================================= */

const WIPE_ITEMS = [
  {key:'evaluations',  label:'تقييمات الطلاب (القديمة)',table:'evaluations',        col:'id',      needs:[],
   count:()=>DATA.evaluations.length},
  {key:'teacherEvals', label:'تقييمات المعلمين (القديمة)',table:'teacher_evaluations',col:'id',  needs:[],
   count:()=>DATA.teacherEvaluations.length},
  {key:'teacherScores',label:'درجات المعلمين الأسبوعية',table:'teacher_scores',    col:'id',      needs:[],
   count:()=>DATA.teacherScores.length},
  {key:'deductions',   label:'خصومات المعلمين',       table:'teacher_deductions', col:'id',      needs:[],
   count:()=>DATA.teacherDeductions.length},
  {key:'reports',      label:'التقارير الأسبوعية',    table:'reports',            col:'id',      needs:[],
   count:()=>DATA.reports.length},
  {key:'announcements',label:'الإعلانات',             table:'announcements',      col:'id',      needs:[],
   count:()=>DATA.announcements.length},
  {key:'champions',    label:'الطلاب المتميزون المحفوظون',table:'champions',      col:'room_id', needs:[],
   count:()=>Object.keys(DATA.champions).length},
  {key:'students',     label:'الطلاب',                table:'students',           col:'id',      needs:['evaluations','champions'],
   count:()=>DATA.students.length},
  {key:'rooms',        label:'القاعات والدورات',      table:'rooms',              col:'id',      needs:['students','reports'],
   count:()=>DATA.rooms.length},
  {key:'teachers',     label:'المعلمون',              table:'teachers',           col:'id',      needs:['rooms','teacherEvals','teacherScores','deductions','reports','evaluations'],
   count:()=>DATA.teachers.length},
  {key:'tasks',        label:'المهام',                table:'tasks',              col:'id',      needs:[],
   count:()=>DATA.tasks.length},
  {key:'ceoReports',   label:'التقارير المرسلة لمدير الأكاديمية',table:'ceo_reports',col:'id',    needs:[],
   count:()=>DATA.ceoReports.length},
  {key:'templates',    label:'قالب المهام',            table:'task_templates',     col:'id',      needs:[],
   count:()=>DATA.taskTemplates.length},
  {key:'groups',       label:'مجموعات المهام',        table:'task_groups',        col:'id',      needs:['tasks'],
   count:()=>DATA.groups.length},
  {key:'employees',    label:'الموظفون',              table:'employees',          col:'id',      needs:['tasks'],
   count:()=>DATA.employees.length}
];

function renderWipeSection(){

  return `

    <div class="settings-section">

      <h3>حذف البيانات القديمة</h3>

      <div class="notice">

        اختر ما تريد حذفه ثم اضغط "حذف المحدد". الحذف نهائي
        ولا يمكن التراجع عنه، ويُنصح بتنزيل نسخة Excel قبله.
        حذف عنصر يحذف تلقائيًا ما يرتبط به (مثلاً حذف الطلاب
        يحذف تقييماتهم، وحذف المعلمين يحذف قاعاتهم وتقييماتهم).

      </div>

      <div class="assignee-grid" style="margin-bottom:14px;">

        ${WIPE_ITEMS.map(i=>`

          <label class="assignee-chip">

            <input
              type="checkbox"
              class="wipe-check"
              value="${i.key}">

            <span>${i.label} (${i.count()})</span>

          </label>

        `).join('')}

      </div>

      <div class="export-buttons" style="justify-content:flex-start;margin-top:0;">

        <button
          type="button"
          class="btn ghost"
          onclick="exportAllExcel()">
          تنزيل نسخة Excel أولاً
        </button>

        <button
          type="button"
          class="btn ghost"
          onclick="wipeSelectAll(true)">
          تحديد الكل
        </button>

        <button
          type="button"
          class="btn ghost"
          onclick="wipeSelectAll(false)">
          إلغاء التحديد
        </button>

        <button
          type="button"
          class="btn danger"
          onclick="wipeSelected()">
          حذف المحدد
        </button>

      </div>

    </div>

  `;
}

function wipeSelectAll(on){

  document
    .querySelectorAll('.wipe-check')
    .forEach(c=>{c.checked=on;});
}

function wipeClosure(keys){

  const set=new Set(keys);

  let changed=true;

  while(changed){

    changed=false;

    WIPE_ITEMS.forEach(i=>{

      if(!set.has(i.key)) return;

      i.needs.forEach(n=>{

        if(!set.has(n)){
          set.add(n);
          changed=true;
        }
      });
    });
  }

  return WIPE_ITEMS.filter(i=>set.has(i.key));
}

async function wipeSelected(){

  const keys=
    Array.from(document.querySelectorAll('.wipe-check:checked'))
      .map(c=>c.value);

  if(!keys.length){

    toast('حدد ما تريد حذفه أولاً.',true);
    return;
  }

  const items=wipeClosure(keys);

  const lines=
    items.map(i=>`• ${i.label}: ${i.count()}`).join('\n');

  const extra=
    items.length>keys.length
      ? '\n\n(أُضيفت تلقائيًا بيانات مرتبطة بما حددته)'
      : '';

  if(!confirm(
    `سيتم حذف البيانات التالية نهائيًا:\n\n${lines}${extra}\n\nهل أنت متأكد؟`
  )){
    return;
  }

  if(prompt('للتأكيد اكتب كلمة: حذف')!=='حذف'){

    toast('تم إلغاء الحذف.');
    return;
  }

  const warnings=[];

  try{

    for(const i of items){

      const expected=i.count();

      if(!expected) continue;

      const deleted=await sb(
        db()
        .from(i.table)
        .delete()
        .neq(i.col,NIL_UUID)
        .select(i.col)
      );

      const n=(deleted||[]).length;

      if(n<expected){
        warnings.push(`${i.label}: حُذف ${n} من ${expected}`);
      }
    }

  }catch(x){

    toast(friendlyError(x),true);
  }

  try{
    await loadData();
  }catch(e){
    console.warn(e);
  }

  staffDraft=[];
  staffDraftDue='';
  adminStaffEmployee='all';

  renderAdmin();

  if(warnings.length){

    toast(
      'لم يُحذف كل شيء — '+warnings.join(' | ')+
      ' (شغّل ملف cleanup_policies.sql في Supabase ثم أعد المحاولة)',
      true
    );

  }else{

    toast('تم حذف البيانات المحددة.');
  }
}

function saveData(){

  /*
   * لم نعد نستخدم window.storage.
   * الحفظ الآن يتم مباشرة في Supabase
   * عند تنفيذ كل عملية.
   */
  return Promise.resolve();
}

/* =========================================================
   تحديث تلقائي عند الرجوع للتبويب
   ========================================================= */

document.addEventListener(
  'visibilitychange',
  async ()=>{

    if(
      document.visibilityState==='visible' &&
      currentUser
    ){

      try{

        await loadData();

        if(currentAdmin){
          renderAdmin();
        }else if(currentTeacherId){
          renderTeacher();
        }else if(currentEmployeeId){
          if(currentIsCeo){ renderCeo(); }else{ renderEmployee(); }
        }

      }catch(e){

        console.warn(
          'تعذر تحديث البيانات:',
          e
        );

      }

    }

  }
);

/* =========================================================
   تشغيل
   ========================================================= */

boot();
