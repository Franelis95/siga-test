/* =====================================================================
   SIGA — Maquette : socle (référentiels, profils, moteur de circuit,
   état, navigation, composants). Référentiels réels DGREH ; les dossiers
   de démonstration portent la marque « Exemple ».
   ===================================================================== */
'use strict';

/* ---------------- Utilitaires ---------------- */
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = (n, l=2) => String(n).padStart(l, '0');
const iso = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const TODAY = iso(new Date());
const addDays = (s, n) => { const d = new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); };
const dfr = s => { if(!s) return '—'; const [y,m,d] = s.slice(0,10).split('-'); return d+'/'+m+'/'+y; };
const dtfr = s => s ? dfr(s)+' '+s.slice(11,16) : '—';
const nowIso = () => { const d = new Date(); return iso(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); };
const days = (a, b) => Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/864e5);
const fmt = n => (n==null||n==='') ? '—' : Number(n).toLocaleString('fr-FR');
let _uid = Date.now() % 100000;
let UID_PFX = '';
const uid = p => (p||'x') + UID_PFX + (++_uid).toString(36);
const initials = n => String(n||'?').replace(/\/.*/, '').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();

/* SHA-256 synchrone (empreintes des actes et chaînage d'audit) */
function sha256(ascii){
  const rr=(v,a)=>(v>>>a)|(v<<(32-a)); const mp=Math.pow, mw=mp(2,32); let res='', words=[];
  const bits=ascii.length*8; const K=[], H=[]; let primeCounter=0; const isC={};
  for(let c=2; primeCounter<64; c++){ if(!isC[c]){ for(let i=0;i<313;i+=c) isC[i]=c;
    H[primeCounter]=(mp(c,.5)*mw)|0; K[primeCounter++]=(mp(c,1/3)*mw)|0; } }
  const h=H.slice(0,8);
  ascii=unescape(encodeURIComponent(ascii)); const L=ascii.length*8;
  ascii+='\x80'; while(ascii.length%64-56) ascii+='\x00';
  for(let i=0;i<ascii.length;i++){ const j=ascii.charCodeAt(i); words[i>>2]|=j<<((3-i)%4)*8; }
  words[words.length]=((L/mw)|0); words[words.length]=(L);
  for(let j=0;j<words.length;){ const w=words.slice(j,j+=16); const oh=h.slice(0);
    for(let i=0;i<64;i++){ const w15=w[i-15], w2=w[i-2]; const a=h[0], e=h[4];
      const t1=h[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&h[5])^((~e)&h[6]))+K[i]
        +(w[i]=(i<16)?w[i]:(w[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0);
      const t2=(rr(a,2)^rr(a,13)^rr(a,22))+((a&h[1])^(a&h[2])^(h[1]&h[2]));
      h.unshift((t1+t2)|0); h[4]=(h[4]+t1)|0; h.length=8; }
    for(let i=0;i<8;i++) h[i]=(h[i]+oh[i])|0; }
  for(let i=0;i<8;i++) for(let j=3;j+1;j--){ const b=(h[i]>>(j*8))&255; res+=((b<16)?'0':'')+b.toString(16); }
  return res;
}

/* ---------------- Icônes (traits 24 px) ---------------- */
const IC = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  bell:'<path d="M6 16V11a6 6 0 1112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  mission:'<path d="M4 20l5-16 3 9 3-5 5 12"/><path d="M4 20h16"/>',
  form:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"/>',
  car:'<path d="M5 16l1.5-6h11L19 16"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
  coins:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  folder:'<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flow:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6H13a3 3 0 013 3v.5M8.5 18H13a3 3 0 003-3v-.5"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  moon:'<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  check:'<path d="M5 12l5 5 9-10"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  swap:'<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  send:'<path d="M3 11l18-8-8 18-2-8z"/>',
  down:'<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>',
  db:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  pin:'<path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>'
};
const ico = (n, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;

/* ---------------- Organigramme réel DGREH ---------------- */
const UNIT_DEF = [
  ['DGREH','DIRECTION GENERALE','Direction Générale des Ressources en Eau et de l’Hydraulique','DG',null],
  ['SDG','SECRETARIAT DG','Secrétariat du Directeur Général','SERVICE','DGREH'],
  ['DEIE',"DIRECTION DES ETUDES ET DE L'INFORMATION SUR L'EAU","Direction des Études et de l'Information sur l'Eau",'DIRECTION','DGREH'],
  ['DIH','DIRECTION DES INFRASTRUCTURES HYDRAULIQUES','Direction des Infrastructures Hydrauliques','DIRECTION','DGREH'],
  ['DMRE','DIRECTION DE LA MOBILISATION DES RESSOURCES EN EAU','Direction de la Mobilisation des Ressources en Eau','DIRECTION','DGREH'],
  ['DPE',"DIRECTION DE LA POLICE DE L'EAU","Direction de la Police de l'Eau",'DIRECTION','DGREH'],
  ['DAEP',"DIRECTION DE L'APPROVISIONNEMENT EN EAU POTABLE","Direction de l'Approvisionnement en Eau Potable",'DIRECTION','DGREH'],
  ['DQE','DIRECTION DE LA QUALITE DES EAUX','Direction de la Qualité des Eaux','DIRECTION','DGREH'],
  ['SF','SERVICE FINANCIER','Service Financier','SERVICE','DGREH'],
  ['SPSE',"SERVICE DE PLANIFICATION DE SUIVI ET D'EVALUATION","Service de la Planification, du Suivi et de l'Évaluation",'SERVICE','DGREH'],
  ['BCMS','BUREAU COMPTABLE MATIERES SECONDAIRE','Bureau Comptable Matières Secondaire','SERVICE','DGREH'],
  ['SCI','SERVICE DE CONTRÔLE INTERNE','Service de Contrôle Interne','SERVICE','DGREH'],
  ['SRH','SERVICE DES RESSOURCES HUAMINES','Service des Ressources Humaines','SERVICE','DGREH'],
  ['SCRP','SERVICE COMMUNICATION ET DES RELATIONS PUBLIQUES','Service de la Communication et des Relations Publiques','SERVICE','DGREH'],
  ['SAD','SERVICE DES ARCHIVES DE LA DOCUMENTATION','Service des Archives et de la Documentation','SERVICE','DGREH']
];
const UNITS = UNIT_DEF.map(([code,src,name,type,parent]) => ({code,src,name,type,parent}));
const UNIT = Object.fromEntries(UNITS.map(u => [u.code, u]));
const unitBySrc = s => UNITS.find(u => u.src.replace(/\s+/g,' ') === String(s).replace(/\s+/g,' ').trim());
const TYPE_LABEL = {DG:'Direction générale', DIRECTION:'Direction', SERVICE:'Service'};

const AG = AGENTS.map(([mat,name,sex,job,cat,fn,src,since,drv]) => {
  const u = unitBySrc(src);
  return {id:mat.replace(/\s+/g,''), mat:mat.trim(), name:name.trim(), sex, job, cat, fn:(fn||'').trim(),
          unit:u?u.code:'DGREH', since, driver:!!drv,
          isHead:/^(Directeur|Directrice|Chef de service)/i.test(fn||'')};
});
const AGENT = Object.fromEntries(AG.map(a => [a.id, a]));
UNITS.forEach(u => { const h = AG.find(a => a.unit===u.code && a.isHead); u.head = h ? h.id : null; });
const ADMIN = {id:'ADMIN', mat:'—', name:'Administrateur SIGA', fn:'Point focal informatique', unit:'DGREH', job:'Compte technique', admin:true};
const person = id => id==='ADMIN' ? ADMIN : AGENT[id];
const nm = id => { const p = person(id); return p ? p.name : '—'; };
const unitName = c => UNIT[c] ? UNIT[c].name : '—';
const unitShort = c => UNIT[c] ? c : '—';
const ancestors = code => { const out=[]; let u = UNIT[code]; while(u){ out.push(u); u = UNIT[u.parent]; } return out; };
const DG_ID = UNIT.DGREH.head;

/* ---------------- Rôles et permissions ---------------- */
const ROLE_LABEL = {DG:'Directeur Général', DIRECTOR:'Directeur', HEAD:'Chef de service', AGENT:'Agent',
  SECRETARIAT:'Secrétariat', RH:'Ressources humaines', SAF:'Service financier', BCMS:'BCMS',
  ARCHIVES:'Archives', CONTROL:'Contrôle interne', ADMIN:'Administrateur'};
function rolesOf(id){
  if(id==='ADMIN') return ['ADMIN'];
  const a = AGENT[id]; if(!a) return [];
  const r = ['AGENT'];
  if(a.id===DG_ID) r.push('DG');
  else if(a.isHead && UNIT[a.unit].type==='DIRECTION') r.push('DIRECTOR');
  else if(a.isHead) r.push('HEAD');
  if(a.unit==='SDG') r.push('SECRETARIAT');
  if(a.unit==='SRH') r.push('RH');
  if(a.unit==='SF') r.push('SAF');
  if(a.unit==='BCMS') r.push('BCMS');
  if(a.unit==='SAD') r.push('ARCHIVES');
  if(a.unit==='SCI' && a.isHead) r.push('CONTROL');
  return r;
}
const PERMS = {
  AGENT:['MISSION_CREATE','REQUEST_CREATE','GED_READ'],
  HEAD:['MISSION_VALIDATE','REQUEST_OPINION','REQUEST_DECIDE','MAIL_ASSIGN','REPORTS','UNIT_READ'],
  DIRECTOR:['MISSION_VALIDATE','REQUEST_OPINION','REQUEST_DECIDE','MAIL_ASSIGN','REPORTS','UNIT_READ'],
  DG:['MISSION_VALIDATE','REQUEST_OPINION','REQUEST_DECIDE','MAIL_IMPUTE','MAIL_ASSIGN','MAIL_READ_ALL','MAIL_READ_CONFIDENTIAL',
      'REPORTS','UNIT_READ','ORG_READ','HR_READ','BCMS_READ','SAF_READ','AUDIT_READ','WORKFLOW_READ','INTERIM_DESIGNATE','MISSION_CANCEL_SIGNED'],
  SECRETARIAT:['MAIL_REGISTER','SLIP_ISSUE','MAIL_ARCHIVE','REQUEST_ENTER_FOR_OTHER','DOCUMENT_UPLOAD_SIGNED','DOCUMENT_GENERATE'],
  RH:['HR_READ','HR_MANAGE','HR_MANAGE_ENTITLEMENT','HR_READ_SENSITIVE','REQUEST_ENTER_FOR_OTHER','ORG_READ','REPORTS'],
  SAF:['SAF_READ','SAF_CONFIRM_FUNDING','SAF_MANAGE','REPORTS','MISSION_VALIDATE'],
  BCMS:['BCMS_READ','BCMS_ASSIGN_RESOURCES','BCMS_MANAGE_FLEET','REPORTS','MISSION_VALIDATE'],
  ARCHIVES:['ARCHIVE_MANAGE','GED_READ_ALL'],
  CONTROL:['AUDIT_READ','REPORTS'],
  ADMIN:['ADMIN','WORKFLOW_READ','WORKFLOW_MANAGE','AUDIT_READ','ARCHIVE_MANAGE','ORG_READ','BACKUP']
};
const can = (perm, id=S.me) => rolesOf(id).some(r => (PERMS[r]||[]).includes(perm));
const mainRole = id => { const r = rolesOf(id); return ['ADMIN','DG','DIRECTOR','HEAD','SECRETARIAT','RH','SAF','BCMS','ARCHIVES','CONTROL','AGENT'].find(x => r.includes(x)); };

/* ---------------- État (mémoire + stockage local si disponible) ---------------- */
const KEY = 'siga.maquette.v1';
let S = null;
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }
function load(){
  try{ const raw = localStorage.getItem(KEY); if(raw){ S = JSON.parse(raw); if(S && S.v===3) return; } }catch(e){}
  S = freshState(); seedExamples(); save();
}
function freshState(){
  return {v:3, me:DG_ID, theme:'', settings:{mail_policy:'HIERARCHICAL', leave_count:'CALENDAR', org:'DGREH'},
    counters:{}, missions:[], requests:[], entitlements:[], mail:[], slips:[], docs:[], notifs:[], audit:[],
    interims:[], delegations:[], bookings:[], budget:[], engagements:[], backups:[], workflows:defaultWorkflows(),
    readNotifs:{}};
}
function nextNum(key, year){ const k = key+'|'+year; S.counters[k] = (S.counters[k]||0)+1; return S.counters[k]; }

/* Audit chaîné : chaque ligne porte l'empreinte de la précédente */
function audit(action, target, detail, actor){
  const prev = S.audit.length ? S.audit[S.audit.length-1].hash : '0'.repeat(64);
  const row = {seq:S.audit.length+1, at:nowIso(), actor:actor||S.me, action, target:target||'', detail:detail||''};
  row.hash = sha256(prev+'|'+row.seq+'|'+row.at+'|'+row.actor+'|'+row.action+'|'+row.target+'|'+row.detail);
  row.prev = prev; S.audit.push(row);
}
function verifyAudit(){
  let prev = '0'.repeat(64);
  for(const r of S.audit){
    const h = sha256(prev+'|'+r.seq+'|'+r.at+'|'+r.actor+'|'+r.action+'|'+r.target+'|'+r.detail);
    if(h!==r.hash) return r.seq; prev = r.hash;
  }
  return null;
}
function notify(to, title, body, link, cat){
  if(!to) return;
  S.notifs.unshift({id:uid('n'), to, title, body:body||'', link:link||'', cat:cat||'ACTION', at:nowIso()});
}

/* ---------------- Intérims et délégations ---------------- */
function interimOn(unitCode, on=TODAY){
  return S.interims.find(i => i.unit===unitCode && i.status==='ACTIVE' && i.from<=on && on<=i.to);
}
/* Qui agit pour le poste de chef de l'unité : intérimaire, sinon titulaire */
function actorOfUnit(code, on=TODAY){
  const u = UNIT[code]; if(!u || !u.head) return null;
  const it = interimOn(code, on);
  return it ? {id:it.agent, cap:'INTERIM', rep:u.head} : {id:u.head, cap:'HOLDER', rep:null};
}
function holdsUnit(agentId, code, on=TODAY){
  const a = actorOfUnit(code, on); return !!a && a.id===agentId;
}
function canActForUnit(agentId, code, perm, on=TODAY){
  if(holdsUnit(agentId, code, on)) return true;
  return S.delegations.some(d => d.unit===code && d.to===agentId && d.status==='ACTIVE' && d.from<=on && (!d.until || on<=d.until)
                                 && (!perm || d.perms.includes(perm)));
}

/* ---------------- Moteur de circuit (reprend plan_circuit de V5) ---------------- */
function defaultWorkflows(){
  return {
    MISSION_ORDER:{label:"Ordre de mission", steps:[
      {code:'SERVICE_HEAD', label:'Chef de service', res:'UNIT_HEAD', nature:'VALIDATION', self:'AUTO', sla:30},
      {code:'DIRECTOR', label:'Directeur', res:'DIRECTOR', nature:'VALIDATION', self:'AUTO', sla:30},
      {code:'BCMS', label:'BCMS : véhicule et chauffeur', res:'UNIT:BCMS', nature:'VALIDATION', self:'AUTO', sla:60, when:'needsVehicle'},
      {code:'SAF', label:'Service financier : financement', res:'UNIT:SF', nature:'VALIDATION', self:'AUTO', sla:45},
      {code:'DG', label:'Directeur Général', res:'DG', nature:'VALIDATION', self:'EXTERNAL', sla:45},
      {code:'SG_SIGNATURE', label:'Signature du SG : dépôt de l’OM signé', res:'UNIT:SDG', nature:'VALIDATION', self:'AUTO', sla:30}]},
    LEAVE:{label:"Demande de jouissance de congé", steps:[
      {code:'SUPERIOR', label:'Avis du supérieur hiérarchique immédiat', res:'SUPERIOR', nature:'OPINION', self:'SKIP'},
      {code:'DIRECTOR', label:'Avis du Directeur de service', res:'DIRECTOR', nature:'OPINION', self:'SKIP'},
      {code:'DG', label:'Décision du Directeur Général', res:'DG', nature:'DECISION', self:'EXTERNAL'}]},
    ABSENCE:{label:"Demande d'autorisation d'absence", steps:[
      {code:'SUPERIOR', label:'Décision du supérieur hiérarchique immédiat', res:'SUPERIOR', nature:'DECISION', self:'EXTERNAL'}]}
  };
}
function resolvePosition(res, requester){
  const a = AGENT[requester]; if(!a) return null;
  const chain = ancestors(a.unit);
  if(res==='UNIT_HEAD'){ const u = chain.find(u => u.head); return u ? u.code : null; }
  if(res==='SUPERIOR'){ const u = chain.find(u => u.head && !holdsUnit(requester, u.code)); return u ? u.code : null; }
  if(res==='DIRECTOR'){ const d = chain.find(u => u.type==='DIRECTION'); return d ? d.code : 'DGREH'; }
  if(res==='DG') return 'DGREH';
  if(res.startsWith('UNIT:')) return res.slice(5);
  return null;
}
function planCircuit(code, requester, ctx={}){
  const wf = S.workflows[code]; if(!wf) return [];
  const st = wf.steps.map(s => {
    const unit = resolvePosition(s.res, requester);
    const act = unit ? actorOfUnit(unit) : null;
    return {code:s.code, label:s.label, nature:s.nature, unit, actor:act?act.id:null, cap:act?act.cap:null, rep:act?act.rep:null,
            status:null, reason:null, sla:s.sla||null, self:s.self, when:s.when};
  });
  st.forEach(s => {
    if(s.when==='needsVehicle' && !ctx.needsVehicle){ s.status='SKIPPED_NO_HOLDER'; s.reason='Pas de véhicule demandé'; return; }
    if(!s.unit){ s.status = s.nature==='DECISION'?'AWAITING':'SKIPPED_NO_HOLDER'; s.reason='Aucun poste de ce niveau'; return; }
    if(!s.actor){ s.status='AWAITING'; s.reason='Poste vacant, sans intérim'; return; }
    if(s.actor===requester){
      if(s.self==='AUTO'){ s.status='AUTO'; s.reason='Le demandeur tient ce niveau : étape franchie (§36bis)'; }
      else if(s.self==='SKIP'){ s.status='SKIPPED_SELF'; s.reason='Avis sans objet sur sa propre demande'; }
      else { s.status='AWAITING'; s.reason='Relève d’une autorité extérieure à la DGREH'; }
    }
  });
  /* Regroupement : une personne n'est sollicitée qu'une fois */
  st.forEach((s,i) => {
    if(s.status) return;
    const later = st.slice(i+1).find(x => x.actor===s.actor && !x.status);
    if(later && (s.nature!=='DECISION')){ s.status='SKIPPED_SAME_ACTOR'; s.reason='Même personne à l’étape « '+later.label+' »'; return; }
    const before = st.slice(0,i).find(x => x.actor===s.actor && !x.status);
    if(before && s.nature==='OPINION'){ s.status='SKIPPED_SAME_ACTOR'; s.reason='Avis déjà rendu à l’étape « '+before.label+' »'; }
  });
  st.forEach(s => { if(!s.status) s.status='PENDING'; });
  return st;
}
const DONE_ST = ['APPROVED','OPINION_GIVEN','AUTO','SKIPPED_NO_HOLDER','SKIPPED_SELF','SKIPPED_SAME_ACTOR'];
function activateNext(steps){
  if(steps.some(s => s.status==='ACTIVE')) return steps.find(s => s.status==='ACTIVE');
  const nx = steps.find(s => s.status==='PENDING' || s.status==='AWAITING');
  if(!nx) return null;
  if(nx.status==='AWAITING') return nx;
  nx.status='ACTIVE'; nx.activatedAt=nowIso(); return nx;
}
const activeStep = d => (d.steps||[]).find(s => s.status==='ACTIVE');
function canActOnStep(step, me=S.me){
  if(!step || step.status!=='ACTIVE') return false;
  if(step.actor===me) return true;
  if(step.unit && canActForUnit(me, step.unit, null)) return true;
  return false;
}
const STEP_TAG = {
  PENDING:['À venir','t-n'], ACTIVE:['En cours','t-gold'], APPROVED:['Validé','t-ok'], REJECTED:['Rejeté','t-bad'],
  RETURNED:['Retourné','t-warn'], OPINION_GIVEN:['Avis rendu','t-ok'], AUTO:['Franchi (§36bis)','t-n'],
  SKIPPED_NO_HOLDER:['Sans objet','t-n'], SKIPPED_SELF:['Sans objet','t-n'], SKIPPED_SAME_ACTOR:['Regroupé','t-n'],
  AWAITING:['Acteur à désigner','t-warn']
};

/* ---------------- Rendu générique ---------------- */
const tag = (label, cls='t-n') => `<span class="tag ${cls}">${esc(label)}</span>`;
const EX = r => r && r.ex ? '<span class="ex" title="Dossier de démonstration">Exemple</span>' : '';
function table(cols, rows, opts={}){
  if(!rows.length) return `<div class="empty"><b>${esc(opts.emptyTitle||'Aucun élément')}</b>${esc(opts.empty||'')}</div>`;
  return `<div class="tbl-w"><table class="t"><thead><tr>${cols.map(c=>`<th class="${c.r?'r':''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr class="${opts.click?'clk':''}" ${opts.click?`data-a="${opts.click}" data-x="${esc(opts.key?opts.key(r):r.id)}"`:''}>
      ${cols.map(c=>`<td class="${c.r?'r':''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}
function circuitHtml(steps){
  return `<div class="circuit">${steps.map((s,i) => {
    const t = STEP_TAG[s.status]||[s.status,'t-n'];
    const cls = ['APPROVED','OPINION_GIVEN'].includes(s.status) ? (s.opinion==='UNFAVORABLE'?'warn':'done')
      : s.status==='REJECTED' ? 'bad' : s.status==='ACTIVE' ? 'act' : s.status==='AWAITING' ? 'warn'
      : ['AUTO','SKIPPED_NO_HOLDER','SKIPPED_SELF','SKIPPED_SAME_ACTOR'].includes(s.status) ? 'skip' : '';
    const nat = s.nature==='OPINION' ? 'Avis' : s.nature==='DECISION' ? 'Décision' : 'Validation';
    return `<div class="stp ${cls}"><div class="dot">${cls==='done'?ico('check'):i+1}</div><div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="lb">${esc(s.label)}</span>${tag(t[0],t[1])}
        <span class="muted" style="font-size:12px">${nat}</span>
        ${s.opinion?tag(s.opinion==='FAVORABLE'?'Favorable':'Défavorable', s.opinion==='FAVORABLE'?'t-ok':'t-bad'):''}</div>
      <div class="who2">${s.actor?esc(nm(s.actor)):'<i>non résolu</i>'}${s.cap==='INTERIM'?` <span class="muted">(intérimaire de ${esc(nm(s.rep))})</span>`:''}${s.by&&s.by!==s.actor?` <span class="muted">· acte signé par ${esc(nm(s.by))} (délégataire)</span>`:''}</div>
      ${s.reason?`<div class="muted" style="font-size:12px">${esc(s.reason)}</div>`:''}
      ${s.at?`<div class="muted" style="font-size:12px">${dtfr(s.at)}</div>`:''}
      ${s.comment?`<div class="cm">${esc(s.comment)}</div>`:''}
    </div></div>`; }).join('')}</div>`;
}
function kpi(label, value, sub, cls='', link=''){
  const tagn = link ? 'a' : 'div';
  return `<${tagn} class="kpi ${cls}" ${link?`href="#${link}"`:''}><span class="l">${esc(label)}</span><span class="v">${value}</span>${sub?`<span class="s">${sub}</span>`:''}</${tagn}>`;
}
function bars(rows, cls=''){
  const max = Math.max(1, ...rows.map(r=>r[1]));
  return `<div class="bars">${rows.map(([l,n,c]) => `<div class="bar" title="${esc(l)} : ${n}"><span>${esc(l)}</span>
    <div class="tr"><div class="fl ${c||cls}" style="width:${Math.max(2,n/max*100)}%"></div></div><span class="n">${fmt(n)}</span></div>`).join('')}</div>`;
}
function officialHeader(title){
  return `<div class="hd"><div class="l">Ministère de l’Agriculture, de l’Eau,<br>des Ressources Animales et Halieutiques<br>-----------<br>Secrétariat Général<br>-----------<br>Direction Générale des Ressources<br>en Eau et de l’Hydraulique<br>-----------</div>
    <div class="r"><b>BURKINA FASO</b><br>-----------<br><i>La Patrie ou la Mort, nous Vaincrons</i></div></div>
    ${title?`<h4>${esc(title)}</h4>`:''}`;
}

/* ---------------- Modale, toast ---------------- */
function modal(title, body, foot, wide){
  closeModal();
  const d = document.createElement('div'); d.className='scrim'; d.id='scrim';
  d.innerHTML = `<div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="x" data-a="closeModal" aria-label="Fermer">×</button></div>
    <div class="modal-b">${body}</div>${foot?`<div class="modal-f">${foot}</div>`:''}</div>`;
  document.body.appendChild(d);
  const f = d.querySelector('input,select,textarea'); if(f) setTimeout(()=>f.focus(),30);
}
function closeModal(){ const d = $('#scrim'); if(d) d.remove(); }
let _tt;
function toast(msg){ let t = $('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; t.setAttribute('role','status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden=false; clearTimeout(_tt); _tt=setTimeout(()=>t.hidden=true, 3200); }
const val = id => { const e = document.getElementById(id); return e ? (e.type==='checkbox'? e.checked : e.value.trim()) : ''; };

/* ---------------- Modules et navigation ---------------- */
const MODS = {};
const GROUPS = ['Pilotage','Processus','Ressources','Documents','Système'];
function mod(key, def){ MODS[key] = def; }
const UI = {tab:{}, sel:{}, q:{}, filter:{}};
function route(){ const h = location.hash.replace('#',''); return MODS[h] ? h : 'accueil'; }
function go(k){ if(location.hash==='#'+k) render(); else location.hash = k; }
const ACT = {};

function renderShell(){
  const k = route();
  const me = person(S.me);
  const tasks = typeof myTasks==='function' ? myTasks() : [];
  const unread = S.notifs.filter(n => n.to===S.me && !S.readNotifs[n.id]).length;
  const navHtml = GROUPS.map(g => {
    const items = Object.entries(MODS).filter(([key,m]) => m.group===g && (!m.visible || m.visible()));
    if(!items.length) return '';
    return `<div class="nav-g">${g}</div>` + items.map(([key,m]) =>
      `<a href="#${key}" class="${key===k?'on':''}">${ico(m.icon)}<span>${esc(m.label)}</span>${key==='taches'&&tasks.length?`<span class="cnt">${tasks.length}</span>`:''}</a>`).join('');
  }).join('');
  const m = MODS[k];
  return `<div class="app" id="app">
  <aside class="rail" aria-label="Modules">
    <div class="brand"><img src="${LOGO}" alt="Logo SIGA"><div><b>SIGA</b><span>Système Intégré de Gestion Administrative · DGREH</span></div></div>
    <nav class="nav">${navHtml}</nav>
    <div class="rail-foot">${typeof serverBanner==='function' ? 'Version de test connectée · 0.9' : 'Maquette interactive · version 0.9'}<br>Base : migrations V1 à V7</div>
  </aside>
  <div class="main">
    ${typeof serverBanner==='function' ? serverBanner() : `<div class="demo no-print"><span><b>Maquette.</b> Organigramme, 160 agents et 67 véhicules réels ; les dossiers marqués « Exemple » servent à la démonstration.</span>
      <button class="btn sm ghost" data-a="resetDemo">Réinitialiser</button></div>`}
    <header class="top">
      <button class="ibtn burger" data-a="toggleNav" aria-label="Ouvrir le menu">${ico('menu')}</button>
      <label class="search" for="gq">${ico('search')}<input id="gq" placeholder="Rechercher un agent, un OM, un courrier, un véhicule…" autocomplete="off" value="${esc(UI.q.global||'')}"><span class="kbd">/</span></label>
      <span class="sp"></span>
      <a class="ibtn" href="#taches" title="Mes tâches" aria-label="Mes tâches">${ico('tasks')}${tasks.length?`<span class="dot">${tasks.length}</span>`:''}</a>
      <a class="ibtn" href="#notifications" title="Notifications" aria-label="Notifications">${ico('bell')}${unread?`<span class="dot">${unread}</span>`:''}</a>
      <button class="ibtn" data-a="theme" title="Thème clair ou sombre" aria-label="Changer de thème">${ico('moon')}</button>
      <button class="who" data-a="switchUser" title="Voir SIGA avec le profil d’un autre utilisateur">
        <span class="av">${esc(initials(me.name))}</span>
        <span class="t"><b>${esc(me.name)}</b><span>${esc(ROLE_LABEL[mainRole(S.me)]||'')} · ${esc(unitShort(me.unit))}</span></span>${ico('swap')}</button>
    </header>
    <main class="page" id="page">${m.visible && !m.visible() ? pageHead(m.group, m.label, '') + denied('Ce module n\u2019est pas ouvert à votre profil.') : m.render()}</main>
  </div></div>`;
}
function pageHead(crumb, title, desc, actions){
  return `<div class="ph"><div class="tt"><div class="crumb">${esc(crumb)}</div><h1>${esc(title)}</h1>${desc?`<p>${desc}</p>`:''}</div>${actions?`<div class="acts">${actions}</div>`:''}</div>`;
}
function denied(what){
  return `<div class="panel"><div class="empty"><b>Accès réservé</b>${esc(what)} Changez de profil avec le bouton en haut à droite pour voir ce module.</div></div>`;
}
function render(){
  const y = window.scrollY;
  document.getElementById('root').innerHTML = renderShell();
  if(UI.keepScroll) window.scrollTo(0,y); UI.keepScroll=false;
  document.title = 'SIGA · ' + (MODS[route()]||{}).label;
}
function rerender(){ UI.keepScroll = true; render(); }
function commit(msg){ save(); rerender(); if(msg) toast(msg); }

/* ---------------- Actions globales ---------------- */
ACT.closeModal = () => closeModal();
ACT.toggleNav = () => $('#app').classList.toggle('nav-open');
ACT.theme = () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur==='dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  S.theme = dark ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', S.theme); save();
};
ACT.resetDemo = () => modal('Réinitialiser la maquette',
  `<p style="margin:0">Les dossiers saisis pendant la démonstration seront effacés et les exemples rechargés. Les référentiels (agents, structures, véhicules) ne changent pas.</p>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn dng" data-a="doReset">Réinitialiser</button>`);
ACT.doReset = () => { try{ localStorage.removeItem(KEY); }catch(e){} S = freshState(); seedExamples(); save(); closeModal(); go('accueil'); toast('Maquette réinitialisée'); };
const QUICK = () => [
  ['DG', DG_ID], ['Directeur', UNIT.DIH.head], ['Chef de service', UNIT.SPSE.head], ['Agent', AG.find(a=>a.unit==='DIH' && !a.isHead && /Ingénieur/.test(a.job)).id],
  ['Secrétariat DG', UNIT.SDG.head], ['Ressources humaines', UNIT.SRH.head], ['Service financier', UNIT.SF.head],
  ['BCMS', UNIT.BCMS.head], ['Archives', UNIT.SAD.head], ['Contrôle interne', UNIT.SCI.head], ['Administrateur', 'ADMIN']];
ACT.switchUser = () => {
  modal('Voir SIGA en tant que…', `
    <p class="muted" style="margin:0">Chaque profil voit ses propres modules, tâches et droits. Les noms proviennent de la liste du personnel au 01/09/2026.</p>
    <div class="mod-grid">${QUICK().map(([l,id]) => `<button class="mod" data-a="setUser" data-x="${id}" style="text-align:left;cursor:pointer">
      <span class="av">${esc(initials(nm(id)))}</span><span><b>${esc(l)}</b><span>${esc(nm(id))}</span></span></button>`).join('')}</div>
    <label class="f" for="usq">Ou tout autre agent<input class="inp" id="usq" placeholder="Nom ou matricule" data-in="userSearch"></label>
    <div id="usr" class="list"></div>`, '', true);
};
ACT.setUser = id => { S.me = id; save(); closeModal(); if(MODS[route()].visible && !MODS[route()].visible()) go('accueil'); else render(); toast('Profil : '+nm(id)); };
const INP = {};
INP.userSearch = v => {
  const q = v.toLowerCase(); const r = q.length<2 ? [] : AG.filter(a => !a.driver && (a.name.toLowerCase().includes(q) || a.mat.replace(/\s/g,'').includes(q.replace(/\s/g,'')))).slice(0,8);
  $('#usr').innerHTML = r.map(a => `<div class="li clk" data-a="setUser" data-x="${a.id}"><span class="av">${esc(initials(a.name))}</span>
    <div class="bd"><b>${esc(a.name)}</b><span>${esc(a.fn)} · ${esc(unitName(a.unit))}</span></div><span class="rt mono">${esc(a.mat)}</span></div>`).join('');
};

/* ---------------- Délégation d'événements ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if(!el) return;
  const fn = ACT[el.dataset.a]; if(!fn) return;
  if(el.tagName==='A' && el.getAttribute('href')==='#') e.preventDefault();
  if(el.tagName==='TR' && e.target.closest('button,a,input,select')) return;
  fn(el.dataset.x, el, e);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if(el && INP[el.dataset.in]) INP[el.dataset.in](el.value, el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if(el && ACT[el.dataset.ch]) ACT[el.dataset.ch](el.value, el, e); });
document.addEventListener('submit', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if(e.key==='Escape') closeModal();
  if(e.key==='/' && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); const q=$('#gq'); if(q) q.focus(); }
  if(e.key==='Enter' && document.activeElement && document.activeElement.id==='gq'){ UI.q.global = document.activeElement.value; go('recherche'); }
});
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0,0); });
