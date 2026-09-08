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

let DATA = emptyData();
let currentUser = null;
let currentProfile = null;
let currentAdmin = false;
let currentTeacherId = null;
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
    teacherDeductions:[]
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

function avgScores(obj,criteria){
  if(!criteria.length) return 0;

  return Math.round(
    criteria.reduce((a,c)=>{
      return a+Number(obj?.[c.key]||0);
    },0)/criteria.length
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
    lastSeenAnnounce:r.last_seen_announce||null
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
    date:r.created_at||r.date
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
}

/* =========================================================
   تسجيل الدخول
   ========================================================= */

function setupLoginUI(){

  const role=$('screen-role');

  if(!role) return;

  populateTeacherSelect();
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

}

async function logout(){

  try{

    if(currentUser?.codeLogin){

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

              <td style="display:flex;gap:6px;">

                <button
                  class="btn ghost small"
                  onclick="regenerateTeacherCode('${t.id}')">

                  كود جديد

                </button>

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
   تقييم المعلمين
   ========================================================= */

function renderAdminTeacherEval(){

  return panel(
    'تقييم المعلمين',

    `
    <div class="notice">

      التقييم أسبوعي ومستمر طوال مدة الدورة:
      اختر المعلم والأسبوع، ثم سجّل تقييم ذلك
      الأسبوع. كل أسبوع يُحفظ بشكل منفصل.

    </div>

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

            ${Array.from({length:24},(_,i)=>i+1).map(w=>`

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

  return `

    ${renderTeacherEvaluationHistory(tid)}

    <form
      onsubmit="saveTeacherEvaluation(event,'${tid}',${week})"
      class="eval-grid">

      ${TEACHER_CRITERIA.map(c=>`

        <label>

          ${c.label}

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
    note:f.get('note')||''
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

            const ev=
              DATA.evaluations.find(
                e=>e.studentId===s.id
              );

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
                    ev
                      ? avgScores(
                          ev.scores,
                          CRITERIA
                        )
                      : 'غير مقيم'
                  }
                </td>

                <td>

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
                    ? `${r.images.length} صورة`
                    : '-'
                  }
                </td>

                <td>

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

      يتحدد الطالب المتميز في كل قاعة تلقائيًا
      حسب متوسط تقييمات المعلم له خلال أسابيع
      الدورة — بدون أي اختيار يدوي.

    </div>

    <div class="form-grid">

      ${DATA.rooms.map(room=>{

        const best=
          getBestStudents(room.id)[0];

        return `

          <div class="card-inner">

            <h3>
              ${esc(room.name)}
            </h3>

            ${
              best
              ? `
                <div class="champion-result">
                  🏆
                  ${esc(best.student.name)}
                  — ${best.average}%
                </div>
              `
              : `
                <div class="empty">
                  لا توجد تقييمات كافية بعد.
                </div>
              `
            }

          </div>

        `;

      }).join('')}

    </div>
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
          avgScores(e.scores,CRITERIA),
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
        'متوسط الأسبوع':avgScores(e.scores,CRITERIA),
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

    <div class="student-evaluation-list">

      ${students.map(student=>{

        const evaluation=
          DATA.evaluations.find(
            e=>e.studentId===student.id && e.week===week
          );

        return renderStudentEvaluationCard(
          student,
          evaluation,
          week
        );

      }).join('')}

    </div>

  `;
}

function renderStudentEvaluationCard(
  student,
  evaluation,
  week
){

  const scores=
    evaluation?.scores||{};

  const history=
    DATA.evaluations
      .filter(e=>e.studentId===student.id)
      .sort((a,b)=>a.week-b.week);

  return `

    <div class="evaluation-card">

      <div class="evaluation-header">

        <div>

          <h3>
            ${esc(student.name)}
          </h3>

          ${
            student.phone
            ? `
              <small>
                ${esc(student.phone)}
              </small>
            `
            :''
          }

        </div>

        ${
          evaluation
          ? `
            <span class="score-badge">

              أسبوع ${week}:
              ${avgScores(
                scores,
                CRITERIA
              )}%

            </span>
          `
          :''
        }

      </div>

      ${
        history.length
        ? `
          <small class="hint" style="display:block;text-align:right;margin-bottom:10px;">
            سجل الأسابيع:
            ${history.map(h=>
              `أسبوع ${h.week}: ${avgScores(h.scores,CRITERIA)}%`
            ).join(' | ')}
          </small>
        `
        :''
      }

      <form
        onsubmit="saveStudentEvaluation(event,'${student.id}',${week})">

        <div class="eval-grid">

          ${CRITERIA.map(c=>`

            <label>

              <span>
                ${c.label}
              </span>

              <select
                name="${c.key}"
                class="input"
                required>

                <option value="">
                  اختر
                </option>

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

                    ${n}

                  </option>

                `).join('')}

              </select>

            </label>

          `).join('')}

        </div>

        <textarea
          name="note"
          class="input"
          rows="3"
          placeholder="ملاحظات المعلم">${esc(
            evaluation?.note||''
          )}</textarea>

        <button
          class="btn primary">

          حفظ تقييم أسبوع ${week} — ${esc(student.name)}

        </button>

      </form>

    </div>

  `;
}

async function saveStudentEvaluation(
  e,
  studentId,
  week
){

  e.preventDefault();

  const student=
    getStudent(studentId);

  if(!student){

    toast('الطالب غير موجود.',true);
    return;
  }

  const room=
    getRoom(student.roomId);

  if(!room){

    toast('الطالب غير مرتبط بقاعة.',true);
    return;
  }

  const w=Number(week)||1;

  const f=new FormData(e.target);

  const payload={

    student_id:studentId,

    teacher_id:currentTeacherId,

    room_id:room.id,

    week:w,

    note:f.get('note')||''

  };

  CRITERIA.forEach(c=>{
    payload[c.key]=Number(
      f.get(c.key)||0
    );
  });

  try{

    const existing=
      DATA.evaluations.find(
        x=>x.studentId===studentId && x.week===w
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
        x=>!(x.studentId===studentId && x.week===w)
      );

    DATA.evaluations.push(mapped);

    toast(`تم حفظ تقييم الأسبوع ${w}`);

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
    (sum,e)=>sum+avgScores(e.scores,CRITERIA),
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
