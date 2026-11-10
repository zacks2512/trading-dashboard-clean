(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const emailForm = $('email-form'), codeForm = $('code-form'), signedIn = $('signed-in');
  const status = $('status');
  let base, busy = false, email = '';

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
  }
  async function auth(path, body) {
    if (!base) throw new Error('שירות ההתחברות אינו זמין כרגע.');
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'הבקשה נכשלה. נסה שוב.');
    return data;
  }
  async function sendCode() {
    email = $('email').value.trim().toLowerCase();
    if (!emailForm.reportValidity() || busy) return;
    setBusy(true);
    try {
      await auth('/email-otp/send-verification-otp', {email, type: 'sign-in'});
      emailForm.hidden = true;
      codeForm.hidden = false;
      $('code').value = '';
      $('code').focus();
      message('קוד נשלח למייל. הזן אותו כאן.');
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  }
  emailForm.addEventListener('submit', event => { event.preventDefault(); sendCode(); });
  $('resend').addEventListener('click', () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    sendCode();
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!codeForm.reportValidity() || busy) return;
    setBusy(true);
    try {
      const result = await auth('/sign-in/email-otp', {email, otp: $('code').value.trim()});
      const user = result.user;
      if (!user?.id) throw new Error('הכניסה הושלמה, אך לא ניתן לקרוא את פרטי המשתמש. רענן את הדף.');
      codeForm.hidden = true;
      signedIn.hidden = false;
      $('identity').textContent = 'מחובר: ' + user.email + ' · אימות מייל: ' + (user.emailVerified ? 'הושלם' : 'טרם הושלם');
      $('code').value = '';
      message('ההתחברות הצליחה.');
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  $('check-access').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sessionResponse = await fetch(base + '/get-session', {
        credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!sessionResponse.ok) throw new Error('לא ניתן לקרוא את ההתחברות. התחבר שוב.');
      const session = await sessionResponse.json();
      const token = sessionResponse.headers.get('set-auth-jwt') || session?.session?.token;
      if (!token || !/^[A-Za-z0-9_.-]+$/.test(token))
        throw new Error('לא התקבל אסימון גישה. התחבר שוב.');
      const response = await fetch('/api/journal', {
        headers: {Authorization: 'Bearer ' + token}, cache: 'no-store'
      });
      if (response.status === 503) throw new Error('ה־API עדיין אינו מוגדר בסביבת הבדיקה.');
      if (response.status === 403) throw new Error('החשבון הזה עדיין לא הוגדר כבעל היומן.');
      if (response.status === 401) throw new Error('האימות פג תוקף. התחבר שוב.');
      if (!response.ok) throw new Error('בדיקת היומן נכשלה (' + response.status + ').');
      const result = await response.json();
      if (!Array.isArray(result.records)) throw new Error('התקבלה תשובה לא צפויה מהיומן.');
      message('הגישה ליומן תקינה. נמצאו ' + result.records.length + ' רשומות בבדיקה.');
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  $('sign-out').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      await auth('/sign-out', {});
      signedIn.hidden = true;
      emailForm.hidden = false;
      message('התנתקת.');
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  (async () => {
    try {
      const response = await fetch('/api/auth-config', {cache: 'no-store'});
      if (!response.ok) throw new Error();
      const config = await response.json();
      base = config.authBaseUrl;
      if (!base) throw new Error();
      message('מוכן לשליחת קוד.');
    } catch (_) {
      emailForm.hidden = true;
      message('שירות ההתחברות עדיין אינו מוגדר בסביבה הזו.', true);
    }
  })();
})();
