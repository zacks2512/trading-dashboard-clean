(function(){
 'use strict';
 if(new URLSearchParams(location.search).get('journal')!=='neon')return;
 const $=id=>document.getElementById(id);
 const banner=document.createElement('div');
 banner.setAttribute('role','status');
 banner.style.cssText='padding:12px 18px;background:#fff3cd;color:#503c00;border-bottom:1px solid #e5d28b';
 banner.textContent='Neon preview · Read-only verification. The trading journal has not been imported yet. Continue recording trades in the production Google Sheet.';
 document.querySelector('.hdr').after(banner);
 $('connection-menu').hidden=true;
 $('google-refresh').hidden=true;
 $('google-disconnect').hidden=true;
 $('connection-state').textContent='Neon preview';
 document.querySelector('.nav-footnote').textContent='Neon preview · read-only';

 async function request(body){
  const configResponse=await fetch('/api/auth-config',{cache:'no-store'});
  if(!configResponse.ok)throw new Error('Neon authentication is not configured.');
  const config=await configResponse.json();
  const base=config.authBaseUrl;
  if(typeof base!=='string'||!base.startsWith('https://'))throw new Error('Neon authentication is not configured.');
  const sessionResponse=await fetch(base+'/get-session',{credentials:'include',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!sessionResponse.ok)throw new Error('Sign in on the connection check page first.');
  const session=await sessionResponse.json();
  const token=sessionResponse.headers.get('set-auth-jwt')||session?.session?.token;
  if(!token||!/^[A-Za-z0-9_.-]+$/.test(token))throw new Error('Sign in on the connection check page first.');
  const response=await fetch('/api/journal',{
   method:body?'POST':'GET',
   headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'same-origin'
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Journal request failed ('+response.status+').');
  return result;
 }
 const db=new NeonJournalStore.NeonStore(request);
 JournalApp.connect(db).then(()=>{
  if(!db.data.trades)return;
  $('connection-state').textContent='Neon preview · connected';
  showStatus('Neon preview loaded in read-only mode. No spreadsheet data has been imported.');
 }).catch(error=>showStatus(error.message,true));
})();
