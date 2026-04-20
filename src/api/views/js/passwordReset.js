document.getElementById('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('passwordReset');
  const passwordConfirm = document.getElementById('passwordConfirm');

  if (password.value !== passwordConfirm.value) {
    password.classList.add('is-invalid');
    passwordConfirm.classList.add('is-invalid');
    document.getElementById('resetPasswordError').classList.remove('d-none');
  } else {
    password.classList.remove('is-invalid');
    passwordConfirm.classList.remove('is-invalid');
    document.getElementById('resetPasswordError').classList.add('d-none');

    const res = await fetch(
      `/api/v1/auth/updatePassword/${document.getElementById('token').value}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ password: password.value }),
      },
    ).then((res) => res.json());
    if (res.status === 'Accepted') {
      document.getElementById('resetTokenError').classList.add('d-none');
      showMessage('Sikeresen frissítetted a jelszavad!');
      document
        .getElementById('messageModal')
        .addEventListener('hidden.bs.modal', async (e) => {
          window.location.href = '/';
        });
    } else {
      if (res.error?.statusCode === 400) {
        document.getElementById('resetTokenError').classList.remove('d-none');
      }
    }
  }
});