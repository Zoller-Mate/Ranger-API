async function loadUserData() {
  user = null;
  try {
    const res = await (
      await fetch('/api/v1/me', {
        method: 'GET',
      })
    ).json();
    if (res.status === 'OK') {
      user = res.data;
    } else {
      user = null;
    }
  } catch (error) {}
}

function updateAuthUI(user = null) {
  const authSection = document.getElementById('authSection');
  const profileSection = document.getElementById('profileSection');
  const campsMenu = document.getElementById('campsMenu');

  if (user) {
    authSection.style.display = 'none';
    profileSection.style.display = 'block';
    campsMenu.style.display = 'block';
    document.getElementById('profileName').textContent =
      user.name || user.email;
    document.getElementById('profileAvatar').src = user.profilePic? `${user.profilePic}` : `/defaultProfilePic.png`;
  } else {
    authSection.style.display = 'block';
    profileSection.style.display = 'none';
    campsMenu.style.display = 'none';
  }
}

async function login(e, relocate = true) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const response = await fetch(`/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    if (response.ok) {
      await loadUserData();
      updateAuthUI(user);

      bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
      document.getElementById('loginErrorAlert').classList.add('d-none');
      if(relocate) window.location = '/';
    } else {
      document.getElementById('loginErrorAlert').classList.remove('d-none');
    }
  } catch (error) {
    showError('Hiba történt a bejelentkezés során.');
  }
}


document.addEventListener('DOMContentLoaded', () => {
  $('#loginForm').on('submit', async e => {
    await login(e);
  });
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupPasswordConfirm').value;

    if (password !== confirmPassword) {
      document.getElementById('signupPassword').classList.add('is-invalid');
      document
        .getElementById('signupPasswordConfirm')
        .classList.add('is-invalid');
      document.getElementById('signupErrorAlert').classList.remove('d-none');
      return;
    }
    document.getElementById('signupPassword').classList.remove('is-invalid');
    document.getElementById('signupPasswordConfirm').classList.remove('is-invalid');

    try {
      const response = await fetch(`/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });
      if (response.ok) {
        document.getElementById('signupEmail').classList.remove('is-invalid');
        await loadUserData();
        updateAuthUI(user);
        document.getElementById('signupErrorAlert').classList.add('d-none');
        bootstrap.Modal.getInstance(
          document.getElementById('signupModal'),
        ).hide();
        document.getElementById('signupForm').reset();
        showMessage("Kérem erősítse meg a regisztrációját az önnek elküldött emailben!")
      } else {
        await response.json().then((res) => {
          if (
            res.message === 'This email is already in use by an other user.'
          ) {
            document.getElementById('signupEmail').classList.add('is-invalid');
          }
        });
        document.getElementById('signupErrorAlert').classList.remove('d-none');
      }
    } catch (error) {
      showError('Hiba történt a regisztráció során.');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    console.log("Logout started")
    const res = await fetch(`/api/v1/auth/logout`, {
      method: 'POST',
    });
    console.log(res);
    user = null;
    updateAuthUI();
  });

  document
    .getElementById('passwordResetForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resetEmail').value;

      try {
        const response = await fetch(`/api/v1/auth/forgotPassword`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });
        console.log(response);
        document.getElementById('passwordResetForm').reset();
        bootstrap.Modal.getInstance(
          document.getElementById('passwordResetModal'),
        ).hide();
      } catch (error) {
        showError('Hiba történt a jelszó visszaállítása során.');
      }
    });
});