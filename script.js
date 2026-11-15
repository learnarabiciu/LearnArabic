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
let teacherTab = 'evaluate';

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
    groups:[]
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
    loginCode:r.login_code||''
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

function stars(v){
  const n=Math.max(0,Math.min(5,Number(v||0)));

  return '★'.repeat(n)+'☆'.repeat(5-n);
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
    durationWeeks:r.duration_weeks||null
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
      .select('*')
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
}

async function loadStaffData(){

  DATA.employees=[];
  DATA.tasks=[];
  DATA.groups=[];

  const isAdmin=
    currentAdmin || currentProfile?.role==='admin';

  if(!isAdmin && !currentEmployeeId) return;

  try{

    const empQ=db().from('employees')
      .select(isAdmin?'*':'id,name,job_title')
      .order('created_at',{ascending:true});

    const taskQ=db().from('tasks').select('*')
      .order('created_at',{ascending:false});

    const groupQ=db().from('task_groups').select('*')
      .order('created_at',{ascending:true});

    const [emps,tasks,groups]=await Promise.all([
      sb(empQ),
      sb(taskQ),
      sb(groupQ).catch(()=>[])
    ]);

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
      db()
      .from('employees')
      .select('*')
      .eq('id',employeeId)
      .eq('login_code',code)
      .maybeSingle()
    );

    if(!row){

      toast(
        'الكود غير صحيح.',
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
      db()
      .from('teachers')
      .select('*')
      .eq('id',teacherId)
      .eq('login_code',code)
      .maybeSingle()
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
    }catch{}

    await loadData();

    selectedTeacherRoomId=
      teacherRooms()[0]?.id||null;

    teacherTab='evaluate';

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

}

async function logout(){

  try{

    if(currentUser?.employeeLogin){

      localStorage.removeItem(
        'saqifah:employeeSession'
      );

    }else if(currentUser?.codeLogin){

      localStorage.removeItem(
        'saqifah:teacherSession'
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
        ${esc(
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
      'evals',
      'تقييم الطلاب',
      adminTab==='evals',
      "adminTab='evals';renderAdmin()"
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
      'champion',
      'الطلاب المتميزون',
      adminTab==='champion',
      "adminTab='champion';renderAdmin()"
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

  ].join('');
}

function renderTeacherNav(){

  const n=$('teacherNav');

  if(!n) return;

  n.innerHTML=[

    navButton(
      'evaluate',
      'تقييم الطلاب',
      teacherTab==='evaluate',
      "teacherTab='evaluate';renderTeacher()"
    ),

    navButton(
      'reports',
      'التقارير الأسبوعية',
      teacherTab==='reports',
      "teacherTab='reports';renderTeacher()"
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

  ].join('');
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

    evals:renderAdminEvals,

    reports:renderAdminReports,

    announce:renderAdminAnnouncements,

    staff:renderAdminStaff,

    champion:renderAdminChampion,

    export:renderAdminExport,

    settings:renderAdminSettings

  };

  m.innerHTML=views[adminTab]();
}

function panel(title,body){

  return `
    <div class="section-head">
      <h2>${title}</h2>
    </div>

    ${body}
  `;
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

      <input
        id="roomDuration"
        type="number"
        min="1"
        class="input"
        placeholder="مدة الدورة (عدد الأسابيع)">

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
                ${
                  r.durationWeeks
                  ? `${r.durationWeeks} أسبوع`
                  : '-'
                }
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

        duration_weeks:
          $('roomDuration').value
            ? Number($('roomDuration').value)
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

                  ${t.driveFolderUrl?'تحديث مجلد Drive':'📁 إنشاء مجلد Drive'}

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
   تقييم المعلمين
   ========================================================= */

function getTeacherDurationWeeks(teacherId){

  const durations=
    DATA.rooms
      .filter(r=>r.teacherId===teacherId)
      .map(r=>r.durationWeeks)
      .filter(Boolean);

  if(!durations.length){
    return 24;
  }

  return Math.max(...durations);
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

  return panel(
    'تقييم المعلمين',

    `
    <div class="notice">

      التقييم أسبوعي ومستمر طوال مدة الدورة
      المحددة للمعلم في قسم "القاعات
      والدورات" — عدد الأسابيع أدناه يُحسب
      تلقائيًا من مدة القاعة/الدورة المسندة
      إليه.

    </div>

    ${renderTeacherRanking()}

    <div class="toolbar">

      <select
        id="adminTeacherEvalSelect"
        class="input"
        onchange="adminTeacherEvalSelected=this.value;adminTeacherEvalWeek=1;renderAdmin()">

        <option value="">
          اختر معلمًا
        </option>

        ${DATA.teachers.map(t=>`

          <option
            value="${t.id}"
            ${
              window.adminTeacherEvalSelected===t.id
              ?'selected'
              :''
            }>
            ${esc(t.name)}
          </option>

        `).join('')}

      </select>

      ${
        window.adminTeacherEvalSelected
        ? `
          <label>الأسبوع</label>
          <select
            class="input"
            onchange="adminTeacherEvalWeek=Number(this.value);renderAdmin()">

            ${Array.from(
              {length:getTeacherDurationWeeks(window.adminTeacherEvalSelected)},
              (_,i)=>i+1
            ).map(w=>`

              <option
                value="${w}"
                ${adminTeacherEvalWeek===w?'selected':''}>
                أسبوع ${w}
              </option>

            `).join('')}

          </select>
        `
        :''
      }

    </div>

    ${renderTeacherEvaluationEditor(
      window.adminTeacherEvalSelected||''
    )}

    `
  );
}

function renderTeacherRanking(){

  const ranked=getBestTeachers();

  if(!ranked.length){

    return `
      <div class="empty">
        لا توجد تقييمات كافية بعد لعرض ترتيب المعلمين.
      </div>
    `;
  }

  return `

    <div class="dashboard-highlight">

      <h3>ترتيب المعلمين (الأفضل أولاً)</h3>

      ${ranked.map((x,i)=>`

        <div class="progress-row">

          <span class="progress-label">
            ${i+1}. ${esc(x.teacher.name)}
          </span>

          ${progressBarHtml(x.average)}

          <span class="progress-pct">
            ${x.average}%
          </span>

        </div>

      `).join('')}

    </div>

  `;
}

function renderTeacherEvaluationHistory(tid){

  const rows=
    DATA.teacherEvaluations
      .filter(x=>x.teacherId===tid)
      .sort((a,b)=>a.week-b.week);

  if(!rows.length){
    return '';
  }

  return `
    <div class="notice">
      سجل الأسابيع السابقة:
      ${rows.map(r=>
        `أسبوع ${r.week}: ${avgScores(r.scores,TEACHER_CRITERIA)}%`
      ).join(' | ')}
    </div>
  `;
}

function renderTeacherEvaluationEditor(tid){

  if(!tid){

    return `
      <div class="empty">
        اختر معلمًا لعرض تقييمه.
      </div>
    `;
  }

  const week=adminTeacherEvalWeek||1;

  const row=
    DATA.teacherEvaluations.find(
      x=>x.teacherId===tid && x.week===week
    );

  const scores=row?.scores||{};
  const aiNotes=row?.aiNotes||{};
  const evidenceLinks=row?.evidenceLinks||{};

  return `

    ${renderTeacherEvaluationHistory(tid)}

    <div class="toolbar">

      <button
        type="button"
        class="btn secondary small"
        onclick="syncTeacherDriveNow('${tid}')">

        🔄 مزامنة من Drive الآن

      </button>

      ${
        row?.autoGenerated
        ? '<span class="hint" style="margin:0;">آخر تحديث لهذا الأسبوع جاء تلقائيًا من Drive، يمكنك تعديل أي درجة قبل الحفظ.</span>'
        : ''
      }

    </div>

    <form
      onsubmit="saveTeacherEvaluation(event,'${tid}',${week})"
      class="eval-grid">

      ${TEACHER_CRITERIA.map(c=>`

        <label>

          ${c.label}
          ${
            evidenceLinks[c.key]
            ? `<a class="link" style="font-size:11.5px;" href="${esc(evidenceLinks[c.key])}" target="_blank" rel="noopener">📎 الملف المرفوع</a>`
            : '<span class="hint" style="margin:0;">لا يوجد ملف مرفوع بعد</span>'
          }
          ${
            aiNotes[c.key]
            ? `<span class="hint" style="margin:0;color:var(--purple);">🤖 ${esc(aiNotes[c.key])}</span>`
            : ''
          }

          <select
            name="${c.key}"
            class="input">

            ${[1,2,3,4,5].map(n=>`

              <option
                value="${n}"
                ${
                  Number(
                    scores[c.key]||0
                  )===n
                    ?'selected'
                    :''
                }>

                ${n} — ${stars(n)}

              </option>

            `).join('')}

          </select>

        </label>

      `).join('')}

      <textarea
        name="note"
        class="input"
        placeholder="ملاحظات">

        ${esc(row?.note||'')}

      </textarea>

      <button
        class="btn primary">

        حفظ التقييم

      </button>

    </form>

  `;
}

async function saveTeacherEvaluation(e,tid,week){

  e.preventDefault();

  const f=new FormData(e.target);

  const w=Number(week)||1;

  const payload={
    teacher_id:tid,
    week:w,
    note:f.get('note')||'',
    auto_generated:false
  };

  TEACHER_CRITERIA.forEach(c=>{
    payload[c.key]=Number(
      f.get(c.key)||0
    );
  });

  try{

    const existing=
      DATA.teacherEvaluations.find(
        x=>x.teacherId===tid && x.week===w
      );

    let row;

    if(existing){

      row=await sb(
        db()
        .from('teacher_evaluations')
        .update(payload)
        .eq('id',existing.id)
        .select()
        .single()
      );

    }else{

      row=await sb(
        db()
        .from('teacher_evaluations')
        .insert(payload)
        .select()
        .single()
      );

    }

    const mapped=
      mapTeacherEval(row);

    DATA.teacherEvaluations=
      DATA.teacherEvaluations.filter(
        x=>!(x.teacherId===tid && x.week===w)
      );

    DATA.teacherEvaluations.push(
      mapped
    );

    toast(`تم حفظ تقييم الأسبوع ${w}`);

    renderAdmin();

  }catch(x){

    toast(
      friendlyError(x),
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
            <th>التقييم</th>
            <th></th>
          </tr>

        </thead>

        <tbody>

          ${DATA.students.map(s=>{

            const overall=
              getStudentAverage(s.id);

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
                  ${
                    overall>0
                      ? overall+'%'
                      : 'غير مقيم'
                  }
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
                🏆 الطالب المتميز:
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
        يمكنك تصدير بيانات الطلاب والتقييمات
        والمعلمين والقاعات والتقارير إلى ملف Excel.
      </p>

      <div class="export-buttons">

        <button
          class="btn primary"
          onclick="exportAllExcel()">

          📊 تصدير جميع البيانات

        </button>

        <button
          class="btn secondary"
          onclick="exportStudentsExcel()">

          👨‍🎓 تصدير الطلاب

        </button>

        <button
          class="btn secondary"
          onclick="exportTeachersExcel()">

          👨‍🏫 تصدير المعلمين

        </button>

      </div>

    </div>
    `
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

  const evaluations=
    DATA.evaluations.map(e=>{

      const student=
        getStudent(e.studentId);

      const room=
        getRoom(e.roomId);

      const teacher=
        getTeacher(e.teacherId);

      const row={
        'الطالب':student?.name||'',
        'القاعة':room?.name||'',
        'المعلم':teacher?.name||'',
        'المتوسط':
          avgScores(e.scores,CRITERIA,10),
        'الملاحظة':e.note||'',
        'التاريخ':fmtDate(e.date)
      };

      CRITERIA.forEach(c=>{
        row[c.label]=
          Number(e.scores?.[c.key]||0);
      });

      return row;
    });

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
      'تقييمات الطلاب':evaluations,
      'التقارير':reports
    },

    `منصة-تعلم-العربية-${new Date().toISOString().slice(0,10)}.xlsx`

  );

  toast('تم تصدير الملف');
}

function exportStudentsExcel(){

  const rows=[];

  DATA.students.forEach(s=>{

    const room=getRoom(s.roomId);
    const teacher=getTeacher(room?.teacherId);
    const overall=getStudentAverage(s.id);

    const studentEvals=
      DATA.evaluations
        .filter(x=>x.studentId===s.id)
        .sort((a,b)=>a.week-b.week);

    if(!studentEvals.length){

      const row={
        'الطالب':s.name,
        'الجوال':s.phone,
        'القاعة':room?.name||'',
        'المعلم':teacher?.name||'',
        'الأسبوع':'',
        'متوسط الأسبوع':'',
        'المتوسط العام':'',
        'الملاحظة':''
      };

      CRITERIA.forEach(c=>{
        row[c.label]='';
      });

      rows.push(row);

      return;
    }

    studentEvals.forEach(e=>{

      const row={
        'الطالب':s.name,
        'الجوال':s.phone,
        'القاعة':room?.name||'',
        'المعلم':teacher?.name||'',
        'الأسبوع':e.week,
        'متوسط الأسبوع':avgScores(e.scores,CRITERIA,10),
        'المتوسط العام':overall,
        'الملاحظة':e.note||''
      };

      CRITERIA.forEach(c=>{
        row[c.label]=e.scores?.[c.key]||'';
      });

      rows.push(row);

    });

  });

  downloadWorkbook(
    {'الطلاب':rows},
    'طلاب-منصة-تعلم-العربية.xlsx'
  );
}

function exportTeachersExcel(){

  const rows=[];

  DATA.teachers.forEach(t=>{

    const deductions=
      DATA.teacherDeductions
        .filter(
          d=>d.teacherId===t.id
        )
        .reduce(
          (sum,d)=>sum+Number(d.points||0),
          0
        );

    const overall=getTeacherAverage(t.id);

    const teacherEvals=
      DATA.teacherEvaluations
        .filter(x=>x.teacherId===t.id)
        .sort((a,b)=>a.week-b.week);

    if(!teacherEvals.length){

      const row={
        'المعلم':t.name,
        'الجوال':t.phone,
        'الأسبوع':'',
        'متوسط الأسبوع':'',
        'المتوسط العام':'',
        'الخصومات':deductions,
        'الملاحظات':''
      };

      TEACHER_CRITERIA.forEach(c=>{
        row[c.label]='';
      });

      rows.push(row);

      return;
    }

    teacherEvals.forEach(e=>{

      const row={
        'المعلم':t.name,
        'الجوال':t.phone,
        'الأسبوع':e.week,
        'متوسط الأسبوع':avgScores(e.scores,TEACHER_CRITERIA),
        'المتوسط العام':overall,
        'الخصومات':deductions,
        'الملاحظات':e.note||''
      };

      TEACHER_CRITERIA.forEach(c=>{
        row[c.label]=e.scores?.[c.key]||'';
      });

      rows.push(row);

    });

  });

  downloadWorkbook(
    {'المعلمون':rows},
    'معلمو-منصة-تعلم-العربية.xlsx'
  );
}

/* =========================================================
   إعدادات الإدارة
   ========================================================= */

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

    evaluate:renderTeacherEvaluate,

    reports:renderTeacherReports,

    announce:renderTeacherAnnouncements,

    settings:renderTeacherSettings

  };

  m.innerHTML=
    views[teacherTab]();

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

          ✓ تحديد الإعلانات كمقروءة

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

function getTeacherAverage(teacherId){

  const rows=
    DATA.teacherEvaluations.filter(
      x=>x.teacherId===teacherId
    );

  if(!rows.length){
    return 0;
  }

  const total=rows.reduce(
    (sum,e)=>sum+avgScores(e.scores,TEACHER_CRITERIA),
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
        🏆 أفضل الطلاب
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
        👨‍🏫 أفضل المعلمين
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

  teacherTab='evaluate';

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

      try{
        savedTeacherId=
          localStorage.getItem('saqifah:teacherSession');
      }catch{}

      if(savedTeacherId){

        try{

          await loadData();

          const t=getTeacher(savedTeacherId);

          if(t){

            currentUser={codeLogin:true,name:t.name};
            currentAdmin=false;
            currentTeacherId=t.id;

            selectedTeacherRoomId=
              teacherRooms()[0]?.id||null;

            teacherTab='evaluate';

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

      teacherTab='evaluate';

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

function assigneeTags(t){

  if(!t.employeeIds.length){
    return '<span class="hint">غير مسندة</span>';
  }

  return t.employeeIds.map(id=>{

    const e=getEmployee(id);

    if(!e) return '';

    return `
      <span class="assignee-tag ${id===currentEmployeeId?'me':''}">
        ${esc(e.name)}
      </span>
    `;

  }).join('');
}

function rerenderStaffViews(){

  if(currentAdmin){
    renderAdmin();
  }else if(currentEmployeeId){
    renderEmployee();
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
            ＋ إضافة مجموعة
          </div>
        `
        : ''
      }

    </div>

    ${
      isAdmin
      ? `
        <div class="toolbar">

          <button
            class="btn ghost"
            onclick="openStaffView('employees')">
            إدارة الموظفين وأكوادهم
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
            (طلاب، تقييمات، تقارير...) استخدم "الإعدادات ← حذف البيانات القديمة".
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
        ← رجوع للمجموعات
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
            ＋ إضافة مهمة
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
            ? tasks.map(t=>{

                const mine=
                  !isAdmin &&
                  t.employeeIds.includes(currentEmployeeId);

                return `

                  <tr class="${mine?'mine-row':''}">

                    <td>
                      <b>${esc(t.title)}</b>
                      ${
                        t.description
                        ? `<div class="hint" style="text-align:right;margin-top:4px;white-space:pre-wrap;">${esc(t.description)}</div>`
                        : ''
                      }
                    </td>

                    <td>
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
                      ${
                        mine
                        ? `
                          <input
                            class="input"
                            placeholder="ملاحظة (اختياري)"
                            value="${esc(t.employeeNote)}"
                            onchange="saveTaskNote('${t.id}',this.value)">
                        `
                        : esc(t.employeeNote||'-')
                      }
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
              }).join('')
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
      status:'todo',
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
      {key:'description',label:'التفاصيل (اختياري)',type:'textarea',value:t?.description||''},
      {key:'dueDate',label:'تاريخ الاستحقاق',type:'date',value:t?.dueDate||''},
      {key:'status',label:'الحالة',type:'select',value:t?.status||'todo',
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
        description:v.description,
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

/* ---------- المجموعات ---------- */

function openGroupModal(id){

  const g=id?getGroup(id):null;

  openEditModal({

    title:g?'تعديل المجموعة':'إضافة مجموعة جديدة',

    fields:[
      {key:'name',label:'اسم المجموعة',value:g?.name||'',required:true},
      {key:'description',label:'وصف (اختياري)',type:'textarea',value:g?.description||''}
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

        toast('تمت إضافة المجموعة');
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
        ← رجوع للمجموعات
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

                    <td>${esc(e.name)}</td>

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
      {key:'phone',label:'الجوال',value:e.phone}
    ],

    onSave:async v=>{

      const row=await updateRow('employees',id,{
        name:v.name,
        job_title:v.jobTitle,
        phone:v.phone
      });

      Object.assign(e,mapEmployee(row));

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
  );
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
            حفظ
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
      {key:'duration',label:'مدة الدورة (عدد الأسابيع)',type:'number',min:1,value:r.durationWeeks||''},
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
        duration_weeks:v.duration?Number(v.duration):null,
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
      {key:'phone',label:'الجوال',value:t.phone}
    ],

    onSave:async v=>{

      const row=await updateRow('teachers',id,{
        name:v.name,
        phone:v.phone
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
   حذف البيانات القديمة (الإعدادات)
   ========================================================= */

const WIPE_ITEMS = [
  {key:'evaluations',  label:'تقييمات الطلاب',        table:'evaluations',        col:'id',      needs:[],
   count:()=>DATA.evaluations.length},
  {key:'teacherEvals', label:'تقييمات المعلمين',      table:'teacher_evaluations',col:'id',      needs:[],
   count:()=>DATA.teacherEvaluations.length},
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
  {key:'teachers',     label:'المعلمون',              table:'teachers',           col:'id',      needs:['rooms','teacherEvals','deductions','reports','evaluations'],
   count:()=>DATA.teachers.length},
  {key:'tasks',        label:'المهام',                table:'tasks',              col:'id',      needs:[],
   count:()=>DATA.tasks.length},
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
          renderEmployee();
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
