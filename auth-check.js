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
