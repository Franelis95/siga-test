/* =====================================================================
   Dossiers de démonstration, tous marqués « Exemple ».
   Personnes, structures et véhicules : référentiels réels.
   ===================================================================== */
function seedExamples(){
  const P = n => { const a = AG.find(x => x.name.toUpperCase().startsWith(n.toUpperCase())); if(!a) throw new Error('Agent introuvable : '+n); return a.id; };
  const H = u => UNIT[u].head;
  const as = (id, fn) => { const keep = S.me; S.me = id; fn(); S.me = keep; };
  const agentDIH = P('ZONGO Jean-Baptiste'), agentDAEP = P('SOMDA Fasaon'), agentDQE = P('KANDIA'), agentSPSE = P('TAPSOBA Christine'),
        agentSRH = P('OUEDRAOGO Kader'), agentDEIE = P('YANOGO Noaga'), drv1 = P('GNANOU Siaka'), drv2 = P('KIEMDE Simon'), drv3 = P('ZIDA Daouda');

  /* ---- Ordres de mission ---- */
  const m1 = createMission({ex:true, subject:'Contrôle des travaux de réalisation de forages positifs', dest:'Banfora', from:addDays(TODAY,6), to:addDays(TODAY,9),
    orgEntity:'Direction des Infrastructures Hydrauliques', initiator:agentDIH, chief:agentDIH, participants:[agentDIH, P('KOBYAGDA'), P('KINI')], needsVehicle:true, tdr:'TDR_controle_forages.pdf'});
  submitMission(m1, agentDIH);
  missionAct(m1, 'APPROVE', {}, H('DIH'));            /* directeur ; l'étape chef de service est regroupée */

  const m2 = createMission({ex:true, subject:'Supervision de la réhabilitation de systèmes d’adduction d’eau potable', dest:'Kaya', from:addDays(TODAY,-2), to:addDays(TODAY,2),
    orgEntity:'Direction de l’Approvisionnement en Eau Potable', initiator:agentDAEP, chief:agentDAEP, participants:[agentDAEP, P('HIEN Léon')], needsVehicle:true});
  submitMission(m2, agentDAEP);
  missionAct(m2,'APPROVE',{}, H('DAEP'));
  m2.vehicle='11 AA 7936 BF'; m2.driver=drv1; missionAct(m2,'APPROVE',{}, H('BCMS'));
  m2.funding='BE'; missionAct(m2,'APPROVE',{}, H('SF'));
  missionAct(m2,'APPROVE',{}, DG_ID);
  missionAct(m2,'APPROVE',{}, H('SDG'));

  const m3 = createMission({ex:true, subject:'Campagne de prélèvement d’échantillons d’eau des forages', dest:'Bobo-Dioulasso', from:addDays(TODAY,1), to:addDays(TODAY,5),
    orgEntity:'Direction de la Qualité des Eaux', initiator:agentDQE, chief:agentDQE, participants:[agentDQE, P('OUATTARA Cheick'), P('BAKO')], needsVehicle:true});
  submitMission(m3, agentDQE);
  missionAct(m3,'APPROVE',{}, H('DQE'));
  m3.vehicle='11 AA 7936 BF'; m3.driver=drv2; missionAct(m3,'APPROVE',{comment:'Véhicule maintenu malgré le chevauchement : retour de Kaya prévu la veille au soir.'}, H('BCMS'));
  m3.funding='PROJ'; missionAct(m3,'APPROVE',{}, H('SF'));

  const m4 = createMission({ex:true, subject:'Atelier régional de planification des investissements hydrauliques', dest:'Koudougou', from:addDays(TODAY,12), to:addDays(TODAY,13),
    orgEntity:'Programme partenaire (TDR reçu)', initiator:agentSPSE, chief:agentSPSE, participants:[agentSPSE, P('SERE Adama')], needsVehicle:false, transport:'Transport de l’organisateur'});
  submitMission(m4, agentSPSE);

  const m5 = createMission({ex:true, subject:'Inventaire des points d’eau modernes', dest:'Ouahigouya', from:addDays(TODAY,20), to:addDays(TODAY,24),
    orgEntity:'Direction des Études et de l’Information sur l’Eau', initiator:agentDEIE, chief:agentDEIE, participants:[agentDEIE], needsVehicle:true});

  /* ---- Décisions de congé et demandes ---- */
  S.entitlements.push({id:'e1', ex:true, agent:agentDIH, act:'Décision de congé (exemple)', year:2026, days:30},
                      {id:'e2', ex:true, agent:H('SPSE'), act:'Décision de congé (exemple)', year:2026, days:30},
                      {id:'e3', ex:true, agent:agentSRH, act:'Décision de congé (exemple)', year:2026, days:30});
  const r1 = createRequest({ex:true, type:'LEAVE', requester:agentDIH, enteredBy:agentDIH, startsOn:addDays(TODAY,25), duration:15, ent:'e1', attached:true});
  submitRequest(r1, agentDIH);
  const r2 = createRequest({ex:true, type:'ABSENCE', requester:agentDQE, enteredBy:agentDQE, startsAt:addDays(TODAY,-1)+'T08:00', duration:4, reason:'FAMILY'});
  submitRequest(r2, agentDQE); requestAct(r2, 'FAVORABLE', '', H('DQE'));
  const r3 = createRequest({ex:true, type:'LEAVE', requester:H('SPSE'), enteredBy:H('SPSE'), startsOn:addDays(TODAY,10), duration:20, ent:'e2', attached:true});
  submitRequest(r3, H('SPSE'));
  requestAct(r3, 'FAVORABLE', '', DG_ID);
  const r4 = createRequest({ex:true, type:'LEAVE', requester:agentSRH, enteredBy:agentSRH, startsOn:addDays(TODAY,40), duration:10, ent:'e3', attached:true});
  submitRequest(r4, agentSRH);
  const r5 = createRequest({ex:true, type:'ABSENCE', requester:drv3, enteredBy:H('SDG'), channel:'SECRETARIAT', startsAt:addDays(TODAY,3)+'T07:30', duration:3, reason:'PERSONAL'});
  submitRequest(r5, H('SDG'));

  /* ---- Courrier ---- */
  const sec = H('SDG');
  const c1 = registerMail({ex:true, dir:'IN', by:sec, corr:'Office National de l’Eau et de l’Assainissement', ref:'N° 2026-0412/ONEA/DG', received:TODAY,
    subject:'Transmission du rapport trimestriel de production d’eau potable', cat:'ORDINAIRE'});
  const c2 = registerMail({ex:true, dir:'IN', by:sec, corr:'Secrétariat Général du Ministère', ref:'N° 2026-118/MAERAH/SG', received:addDays(TODAY,-1),
    subject:'Invitation à l’atelier de validation du rapport annuel de performance', cat:'INVITATION', scan:true});
  c2.status='AWAITING_IMPUTATION'; c2.transmittedAt=addDays(TODAY,-1)+'T10:15'; mailLog(c2, sec, 'Remis au DG pour imputation');
  const c3 = registerMail({ex:true, dir:'IN', by:sec, corr:'Direction Régionale de l’Agriculture, de l’Eau, des Ressources Animales et Halieutiques des Hauts-Bassins', ref:'N° 2026-077/DRAERAH-HBS',
    received:addDays(TODAY,-4), subject:'Demande d’appui technique pour le suivi de forages en zone rurale', cat:'ORDINAIRE', scan:true});
  const c4 = registerMail({ex:true, dir:'IN', by:sec, corr:'Agence de l’Eau du Mouhoun', ref:'N° 2026-031/AEM/DG', received:addDays(TODAY,-15),
    subject:'Demande de données hydrologiques des stations du bassin', cat:'ORDINAIRE', scan:true});
  const c5 = registerMail({ex:true, dir:'IN', by:sec, corr:'Cabinet du Ministre', ref:'', received:TODAY, subject:'Pli confidentiel relatif à un dossier du personnel', cat:'ORDINAIRE', conf:true});
  c5.status='AWAITING_IMPUTATION'; c5.transmittedAt=nowIso(); mailLog(c5, sec, 'Pli remis fermé au DG');
  const c6 = registerMail({ex:true, dir:'IN', by:sec, corr:'Mairie de Ziniaré', ref:'N° 2026-044/CZ', received:addDays(TODAY,-9), subject:'Demande d’information sur un projet de forage communal', scan:true});
  const impute = (m, targets, by, when, due) => { m.status='IMPUTED'; m.transmittedAt=addDays(when,-2)+'T09:00'; m.imputedBy=by; m.impCap='HOLDER'; m.imputedAt=when+'T11:30';
    targets.forEach(([u,role,instr]) => m.targets.push({id:uid('t'), unit:u, role, instr, due:role==='LEAD'?due:null, parent:null, status:'OPEN'})); mailLog(m, by, 'Imputation : '+targets.map(t=>t[0]).join(', ')); };
  impute(c3, [['DIH','LEAD','ATTRIBUTION'],['DEIE','COPY','INFORMATION']], DG_ID, addDays(TODAY,-2), addDays(TODAY,8));
  impute(c4, [['DEIE','LEAD','SUITE'],['DMRE','COPY','INFORMATION']], DG_ID, addDays(TODAY,-12), addDays(TODAY,-3));
  c4.assignments.push({id:uid('a'), target:c4.targets[0].id, by:H('DEIE'), to:agentDEIE, instr:'SUITE', due:addDays(TODAY,-3), status:'OPEN', at:addDays(TODAY,-11)+'T09:00'});
  c4.status='IN_PROGRESS'; mailLog(c4, H('DEIE'), 'Attribué à '+nm(agentDEIE));
  impute(c6, [['DAEP','LEAD','ATTRIBUTION']], DG_ID, addDays(TODAY,-8), addDays(TODAY,2));
  c6.assignments.push({id:uid('a'), target:c6.targets[0].id, by:H('DAEP'), to:agentDAEP, instr:'ATTRIBUTION', due:addDays(TODAY,2), status:'OPEN', at:addDays(TODAY,-7)+'T10:00'});
  c6.status='IN_PROGRESS';
  const d1 = registerMail({ex:true, dir:'OUT', by:agentDAEP, corr:'Mairie de Ziniaré', subject:'Réponse : informations sur le projet de forage communal', inReplyTo:c6.id, unit:'DAEP', date:TODAY});
  c6.replyId = d1.id; d1.status='AWAITING_SIGNATURE'; mailLog(d1, agentDAEP, 'Présenté à la signature');
  const d0 = registerMail({ex:true, dir:'OUT', by:sec, corr:'Secrétariat Général du Ministère', subject:'Transmission du rapport d’activités du premier semestre', unit:'SPSE', date:addDays(TODAY,-6), signer:DG_ID, scan:true});
  d0.status='SENT'; d0.num = REG_FMT.DEPART(nextNum('DEPART',2026)); d0.sentOn=addDays(TODAY,-6);
  S.slips.push({id:uid('s'), ex:true, to:'Secrétariat Général du Ministère', lines:[{d:'Lettre n° '+d0.num,q:1},{d:'Rapport d’activités du premier semestre',q:3}], status:'ACKNOWLEDGED', issued:addDays(TODAY,-6), ack:addDays(TODAY,-5), ackBy:'Bureau du courrier du SG', num:REG_FMT.BORDEREAU(nextNum('BORDEREAU',2026))});

  /* ---- Délégation, budget, sauvegardes ---- */
  S.delegations.push({id:'g1', ex:true, unit:'SF', to:P('COULIBALY Tuinwuma'), perms:['SAF_CONFIRM_FUNDING'], from:addDays(TODAY,-30), status:'ACTIVE'});
  S.budget.push({ex:true, label:'Frais de mission à l’intérieur', src:'Budget de l’État', alloc:25000000, eng:17350000},
                {ex:true, label:'Carburant et lubrifiants', src:'Budget de l’État', alloc:18000000, eng:12600000},
                {ex:true, label:'Entretien et réparation des véhicules', src:'Budget de l’État', alloc:12000000, eng:10900000},
                {ex:true, label:'Fournitures de bureau', src:'Budget de l’État', alloc:6000000, eng:2100000},
                {ex:true, label:'Missions du projet', src:'Projet (financement extérieur)', alloc:15000000, eng:4200000});
  for(let i=0;i<7;i++) S.backups.push({ex:true, at:addDays(TODAY,-i)+'T02:00', kind:i===((new Date().getDay()+6)%7)?'Complète (hebdomadaire)':'Différentielle', size:i===0?'1,4 Go':'210 Mo', ok:true});
  S.notifs.forEach(n => { if(n.at < TODAY) S.readNotifs[n.id] = true; });
}
