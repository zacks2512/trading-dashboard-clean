'use strict';

// Browser OAuth client: never add a client secret, service account key or token here.
const GOOGLE_CLIENT_ID = '462464331711-65qlv4a6gu0shke4gb5229nm2umntbmk.apps.googleusercontent.com';
const GOOGLE_PROJECT_NUMBER = '462464331711';
const FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let googleToken = null;
let tokenDeadline = 0;
let expiryTimer = null;
let sessionGeneration = 0;
let readGeneration = 0;
let selectedFile = null;
let worksheets = [];
let oauthPending = false;
const scriptPromises = new Map();

function loadGoogleScript(url) {
  if (!scriptPromises.has(url)) {
    scriptPromises.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => { script.remove(); scriptPromises.delete(url); reject(new Error('Google could not load. Check your connection and try again.')); };
      document.head.append(script);
    }));
  }
  return scriptPromises.get(url);
}

function connectionControls() {
  const signedIn = Boolean(googleToken);
  const state = document.getElementById('connection-state');
  if(state){state.textContent=oauthPending?'Connecting…':signedIn?(selectedFile?'Connected':'Select a sheet'):'Disconnected';if(state.dataset)state.dataset.state=oauthPending?'pending':signedIn?(selectedFile?'connected':'authorized'):'disconnected';}
  document.getElementById('google-connect').disabled = oauthPending;
  document.getElementById('google-connect').textContent = signedIn ? 'Reconnect Google' : 'Connect Google';
  document.getElementById('google-pick').disabled = !signedIn;
  document.getElementById('google-refresh').disabled = !signedIn || !selectedFile;
  document.getElementById('private-tab').disabled = !signedIn || !selectedFile;
  document.getElementById('google-disconnect').disabled = !signedIn && !oauthPending;
}

function pickerKey() { return document.getElementById('picker-api-key').value.trim(); }
function savePickerKey() {
  const key = pickerKey();
  if (!/^AIza[\w-]{30,}$/.test(key)) { showStatus('Paste the restricted Google Picker API key.', true); return; }
  try { localStorage.setItem('trading.pickerPublicKey', key); showStatus('Picker key saved on this browser.'); }
  catch (_) { showStatus('Browser storage unavailable. The key will work for this session.'); }
}
try { document.getElementById('picker-api-key').value = localStorage.getItem('trading.pickerPublicKey') || ''; } catch (_) {}

function clearGoogleSession() {
  sessionGeneration++; readGeneration++;
  clearTimeout(expiryTimer);
  googleToken = null; tokenDeadline = 0; selectedFile = null; worksheets = []; oauthPending = false;
  document.getElementById('private-tab').replaceChildren();
  if(window.JournalApp)JournalApp.clear();
  resetPrivateView(); connectionControls();
}
function disconnectGoogle() {
  const previous = googleToken;
  clearGoogleSession();
  showStatus('Disconnected. Loaded data cleared.');
  if (previous && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(previous, () => {});
}
function validSession() {
  if (!googleToken || Date.now() >= tokenDeadline) {
    clearGoogleSession();
    throw new Error('Google access expired. Connect again, then choose your sheet.');
  }
}

async function connectGoogle() {
  if (oauthPending) return;
  clearGoogleSession();
  const generation = sessionGeneration;
  oauthPending = true; connectionControls();
  showStatus('Loading Google authorization.');
  try {
    await loadGoogleScript('https://accounts.google.com/gsi/client');
    if (generation !== sessionGeneration) return;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: FILE_SCOPE,
      include_granted_scopes: false,
      callback: response => {
        if (generation !== sessionGeneration) return;
        oauthPending = false;
        if (response.error || !response.access_token) { connectionControls(); showStatus('Authorization was not granted. Try connecting again.', true); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, FILE_SCOPE)) { connectionControls(); showStatus('File permission was not granted.', true); return; }
        googleToken = response.access_token;
        const lifetime = Number(response.expires_in) || 3600;
        tokenDeadline = Date.now() + Math.max(0, lifetime - 30) * 1000;
        expiryTimer = setTimeout(() => { clearGoogleSession(); showStatus('Google access expired. Connect again to reload your data.', true); }, Math.max(0, lifetime - 30) * 1000);
        connectionControls();
        showStatus('Connected. Click Choose private sheet.');
      },
      error_callback: () => {
        if (generation !== sessionGeneration) return;
        oauthPending = false; connectionControls();
        showStatus('Google sign-in closed or blocked. Allow popups and try again.', true);
      }
    });
    client.requestAccessToken({prompt: 'select_account'});
  } catch (error) {
    if (generation !== sessionGeneration) return;
    oauthPending = false; connectionControls(); showStatus(error.message, true);
  }
}

async function googleRead(path, generation) {
  validSession();
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + path, {
    headers: {Authorization: 'Bearer ' + googleToken},
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
  });
  if (generation !== sessionGeneration) throw new Error('Stale connection');
  if (response.status === 401) { clearGoogleSession(); throw new Error('Google access expired. Reconnect and choose your sheet again.'); }
  if (response.status === 403 || response.status === 404) throw new Error('Access denied. Choose the file through the picker with the account that owns it.');
  if (response.status === 429) throw new Error('Google request limit reached. Wait briefly and refresh.');
  if (!response.ok) throw new Error('Google Sheets request failed (' + response.status + '). Try refreshing.');
  return response.json();
}

async function choosePrivateSheet() {
  const generation = sessionGeneration;
  try {
    validSession();
    if (!pickerKey()) { sw('settings'); throw new Error('Paste and save your restricted Picker API key in Settings first.'); }
    await loadGoogleScript('https://apis.google.com/js/api.js');
    await new Promise((resolve, reject) => gapi.load('picker', {callback: resolve, onerror: () => reject(new Error('Google Picker could not load.')), timeout: 15000, ontimeout: () => reject(new Error('Google Picker timed out.'))}));
    if (generation !== sessionGeneration) return;
    validSession();
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setIncludeFolders(false);
    const picker = new google.picker.PickerBuilder()
      .addView(view).setOAuthToken(googleToken).setDeveloperKey(pickerKey())
      .setAppId(GOOGLE_PROJECT_NUMBER).setOrigin(location.origin)
      .setCallback(async data => {
        if (generation !== sessionGeneration || data.action !== google.picker.Action.PICKED) return;
        const file = data.docs?.[0];
        if (!file || file.mimeType !== 'application/vnd.google-apps.spreadsheet') { showStatus('Choose a Google Sheets spreadsheet.', true); return; }
        await openPrivateSheet(file.id, generation);
      }).build();
    picker.setVisible(true);
  } catch (error) { if (generation === sessionGeneration) showStatus(error.message, true); }
}

async function openPrivateSheet(fileId, generation) {
  const request = ++readGeneration;
  selectedFile = null; worksheets = [];
  if(window.JournalApp)JournalApp.clear();
  document.getElementById('private-tab').replaceChildren();
  resetPrivateView(); connectionControls(); showStatus('Opening private spreadsheet.');
  try {
    const metadata = await googleRead(encodeURIComponent(fileId) + '?fields=spreadsheetId,sheets(properties(sheetId,title,gridProperties))', generation);
    if (request !== readGeneration || generation !== sessionGeneration) return;
    worksheets = (metadata.sheets || []).map(s => s.properties).filter(s => s.gridProperties && !s.title.startsWith('TJ_'));
    if (!worksheets.length) throw new Error('This spreadsheet has no supported worksheets.');
    const select = document.getElementById('private-tab');
    for (const sheet of worksheets) { const option = document.createElement('option'); option.value = String(sheet.sheetId); option.textContent = sheet.title; select.append(option); }
    // Initial journal tab from the user's link, if it exists in the chosen file.
    if (worksheets.some(s => s.sheetId === 623391435)) select.value = '623391435';
    selectedFile = fileId; connectionControls();
    if(window.JournalApp)await JournalApp.connect(createJournalTransport());
    if(generation !== sessionGeneration)return;
    const legacyTitle=window.JournalApp?.legacyTitle?.()||'All Data';
    const legacySheet=worksheets.find(s=>s.title===legacyTitle);
    if(legacySheet)select.value=String(legacySheet.sheetId);
    await loadPrivateTab();
  } catch (error) { if (request === readGeneration && generation === sessionGeneration) showStatus(error.message, true); }
}

async function loadPrivateTab() {
  const generation = sessionGeneration;
  const request = ++readGeneration;
  if(window.JournalApp)JournalApp.clearLegacy();
  resetPrivateView();
  try {
    validSession();
    if (!selectedFile) throw new Error('Choose a private spreadsheet first.');
    const sheet = worksheets.find(s => String(s.sheetId) === document.getElementById('private-tab').value);
    if (!sheet) throw new Error('Choose a worksheet.');
    showStatus('Reading private worksheet.');
    const range = "'" + sheet.title.replace(/'/g, "''") + "'";
    const result = await googleRead(encodeURIComponent(selectedFile) + '/values/' + encodeURIComponent(range) + '?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING', generation);
    if (request !== readGeneration || generation !== sessionGeneration) return;
    const values = result.values || [];
    const headers = (values[0] || []).map(String).map(s => s.trim());
    if (!headers.includes(COL.name) && !headers.includes(COL.symbol)) throw new Error('Expected column headings in the first row. Check the selected tab and column mapping in Settings.');
    const rows = values.slice(1).filter(row => row.some(cell => String(cell).trim())).map(row => Object.fromEntries(headers.map((header, i) => [header, String(row[i] ?? '')])));
    if(window.JournalApp)JournalApp.setLegacy(rows,selectedFile+':'+sheet.sheetId);else ingest(rows,'Private Google Sheet');
    if(rows.length)showStatus('Private worksheet loaded. Journal entries use the separate TJ_ tabs.');
  } catch (error) {
    if (request === readGeneration && generation === sessionGeneration) showStatus(error.message, true);
    else if (!googleToken) showStatus('Google access expired. Connect again.', true);
  }
}
connectionControls();

// A transport is bound to one selected file and one OAuth session. It cannot follow a later file switch.
function createJournalTransport(){
 const fileId=selectedFile,generation=sessionGeneration;
 return {async request(path,{method='GET',body}={}){
  if(generation!==sessionGeneration||fileId!==selectedFile)throw new Error('The Google connection changed. Reconnect and reload.');
  validSession();const isWrite=method!=='GET';let response;
  try{response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(fileId)+path,{method,headers:{Authorization:'Bearer '+googleToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});}
  catch(_){const error=new Error(isWrite?'Save response was lost. Reload to verify whether it reached Google before trying again.':'Cannot reach Google Sheets. Check your connection.');error.uncertain=isWrite;throw error;}
  if(generation!==sessionGeneration||fileId!==selectedFile){const error=new Error('Connection changed during the request. Reload this file to verify its latest data.');error.uncertain=isWrite;throw error;}
  if(response.status===401){clearGoogleSession();throw new Error('Google access expired. Reconnect before saving again.');}
  if(!response.ok){const error=new Error(response.status===403?'Google denied access. Select an editable copy owned by your dedicated account.':response.status===429?'Google request limit reached. Wait briefly, then reload.':'Google Sheets request failed ('+response.status+'). Reload before retrying.');error.uncertain=isWrite&&response.status>=500;throw error;}
  return response.json();
 }};
}

async function refreshPrivateData(){
 await loadPrivateTab();
 if(window.JournalApp)await JournalApp.reload();
}
