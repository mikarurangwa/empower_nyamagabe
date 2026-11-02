// Log in, sign up and password reset pages

const alertBox = document.getElementById('formAlert');

function goToDashboard() {
  window.location.href = '/?open=dashboard';
}

async function withButton(button, busyText, work) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  try {
    await work();
  } catch (err) {
    showMessage(alertBox, err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// Log in

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  let role = 'donor';

  document.querySelectorAll('[data-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      role = btn.dataset.role;
      document.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideMessage(alertBox);
    withButton(document.getElementById('loginButton'), 'Logging in…', async () => {
      const { user, token } = await post('/auth/login', {
        identifier: document.getElementById('loginIdentifier').value.trim(),
        password: document.getElementById('loginPassword').value,
        role,
      });
      session.save(user, token);
      goToDashboard();
    });
  });

  document.getElementById('forgotToggle').addEventListener('click', () => {
    const box = document.getElementById('resetBox');
    box.classList.toggle('hidden');
    const typed = document.getElementById('loginIdentifier').value.trim();
    if (typed.includes('@')) document.getElementById('resetEmail').value = typed;
  });

  document.getElementById('resetButton').addEventListener('click', (e) => {
    hideMessage(alertBox);
    withButton(e.target, 'Sending…', async () => {
      const email = document.getElementById('resetEmail').value.trim();
      if (!email) throw new Error('Enter your email address.');
      const res = await post('/auth/password-reset/request', { email });
      showMessage(alertBox, res.message, 'success');
    });
  });
}

// Sign up

const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideMessage(alertBox);
    withButton(document.getElementById('signupButton'), 'Creating account…', async () => {
      const name = document.getElementById('signupName').value.trim();
      const email = document.getElementById('signupEmail').value.trim();
      const phone = document.getElementById('signupPhone').value.trim();
      const password = document.getElementById('signupPassword').value;

      if (!email && !phone) throw new Error('Enter a phone number or an email address.');
      if (password.length < 6) throw new Error('Your password needs at least 6 characters.');
      if (password !== document.getElementById('signupConfirm').value) throw new Error('The passwords don\'t match.');

      const { user, token } = await post('/auth/signup', { name, email, phone, password });
      session.save(user, token);
      goToDashboard();
    });
  });
}

// Reset password

const resetForm = document.getElementById('resetForm');
if (resetForm) {
  const params = new URLSearchParams(window.location.search);
  document.getElementById('resetFormEmail').value = params.get('email') || '';
  document.getElementById('resetToken').value = params.get('token') || '';

  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideMessage(alertBox);
    withButton(document.getElementById('resetSubmit'), 'Saving…', async () => {
      const newPassword = document.getElementById('newPassword').value;
      if (newPassword !== document.getElementById('confirmPassword').value) throw new Error('The passwords don\'t match.');

      const res = await post('/auth/password-reset/confirm', {
        email: document.getElementById('resetFormEmail').value.trim(),
        token: document.getElementById('resetToken').value,
        newPassword,
      });
      showMessage(alertBox, res.message, 'success');
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    });
  });
}
