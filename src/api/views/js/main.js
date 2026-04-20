let user = null;

function showError(
  message = 'Valami hiba történt. Kérlek, próbálkozz később!',
) {
  document.getElementById('errorMessage').textContent = message;
  const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
  errorModal.show();
}

function showMessage(message = '') {
  document.getElementById('modalMessage').textContent = message;
  const messageModal = new bootstrap.Modal(
    document.getElementById('messageModal'),
  );
  messageModal.show();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadUserData();
  updateAuthUI(user);
});

