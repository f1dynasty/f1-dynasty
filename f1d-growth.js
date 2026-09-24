/* Keep the backup landing layout intact; collect click events without moving UI. */
(function(){
  'use strict';
  const G=window.F1DGrowth={};
  function attach(doc){
    if(!doc?.body||doc.__f1dLandingEvents)return;
    const root=doc.querySelector('[data-screen="landing"]')||doc.querySelector('#page-landing');
    if(!root)return;
    doc.__f1dLandingEvents=true;
    root.addEventListener('click',event=>{
      const b=event.target.closest('button,a,[onclick]');if(!b)return;
      const action=b.getAttribute('data-act')||'',onClick=b.getAttribute('onclick')||'';
      let name=null;
      if(action==='start'||b.id==='btn-start-game-landing'||/startFromLanding|startNewGame/.test(onClick))name='landing_start_clicked';
      else if(action==='rosterEditor'||/openEditor/.test(onClick))name='landing_roster_editor_opened';
      else if(action==='createTeam'||b.id==='custom-team-builder-toggle-landing'||/toggleCustomTeam|createCustomTeam/.test(onClick))name='landing_custom_team_opened';
      if(name)try{window.__f1dEv(name);}catch(_){}
    },true);
  }
  G.attach=attach;
  G.enhanceLanding=function(){};
  function scan(){
    attach(document);
    document.querySelectorAll('iframe').forEach(frame=>{
      try{attach(frame.contentDocument);}catch(_){}
      if(!frame.__f1dLandingLoad){frame.__f1dLandingLoad=true;frame.addEventListener('load',scan);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
  let attempts=0;const discover=setInterval(()=>{scan();if(++attempts>=30)clearInterval(discover);},500);
})();

/* Installation is optional and is offered only after demonstrated play. */
(function(){
  'use strict';
  let installEvent=null,shown=false,busy=false;
  const read=k=>{try{return localStorage.getItem(k);}catch(_){return null;}};
  const write=(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}};
  const track=(name,data)=>{try{window.__f1dEv(name,data||{});}catch(_){}};
  const installed=()=>!!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||read('f1d_pwa_installed'));
  const P=window.F1DPWA={
    visit(){
      try{if(sessionStorage.getItem('f1d_meaningful_visit'))return;sessionStorage.setItem('f1d_meaningful_visit','1');}catch(_){}
      const n=Number(read('f1d_meaningful_visits')||0)+1;write('f1d_meaningful_visits',String(n));if(n>=2)P.qualify();
    },
    qualify(){write('f1d_pwa_eligible','1');setTimeout(P.showIfReady,1500);},
    showIfReady(){
      if(!installEvent||shown||busy||installed()||read('f1d_pwa_dismissed')||!read('f1d_pwa_eligible')||document.visibilityState==='hidden')return;
      if(Array.from(document.querySelectorAll('.modal-overlay')).some(el=>getComputedStyle(el).display!=='none'))return;
      shown=true;
      const box=document.createElement('aside');box.id='f1d-install-cta';box.setAttribute('aria-label','Install F1 Dynasty');
      box.style.cssText='position:fixed;bottom:80px;right:16px;z-index:100000;width:min(330px,calc(100vw - 32px));padding:16px;background:#10141c;color:#fff;border:1px solid #c0012e;border-radius:12px;box-shadow:0 12px 32px #0005;font:13px system-ui';
      box.innerHTML='<strong>Add F1 Dynasty to your home screen</strong><p>Play your career like an app and jump straight back in.</p><button type="button" data-install class="btn btn-red">Add to home screen</button> <button type="button" data-dismiss class="btn btn-outline" style="color:#ddd">Not now</button>';
      box.querySelector('[data-dismiss]').onclick=()=>{write('f1d_pwa_dismissed','1');box.remove();track('pwa_install_dismissed',{reason:'cta'});};
      box.querySelector('[data-install]').onclick=async()=>{
        if(!installEvent||busy)return;busy=true;track('pwa_install_clicked');
        const prompt=installEvent;installEvent=null;box.remove();
        try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome!=='accepted'){write('f1d_pwa_dismissed','1');track('pwa_install_dismissed',{reason:'browser'});}}
        catch(_){write('f1d_pwa_dismissed','1');track('pwa_install_dismissed',{reason:'unavailable'});}
        finally{busy=false;}
      };
      document.body.appendChild(box);track('pwa_install_prompt_shown');
    }
  };
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;P.showIfReady();});
  window.addEventListener('appinstalled',()=>{write('f1d_pwa_installed','1');installEvent=null;document.getElementById('f1d-install-cta')?.remove();track('pwa_installed');});
  try{if(Storage.getAllSaveInfos().length)P.visit();}catch(_){}
  document.addEventListener('visibilitychange',P.showIfReady);
  setInterval(()=>{if(installEvent&&!shown)P.showIfReady();},4000);
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load',()=>{navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});});
  }
  function offline(){try{UI.toast('Offline — your local careers still work. Cloud sync needs a connection.','info');}catch(_){}}
  window.addEventListener('offline',offline);if(navigator.onLine===false)offline();
})();
