//region profile data

const loadProfile = async () => {
  if (!user) {
    await loadUserData();
  }
  document.getElementById('profilePic').src = user.profilePic??"/defaultProfilePic.png";
  document.getElementById('name').value = user.name;
  document.getElementById('email').value = user.email;
  document.getElementById('dateOfBirth').value = user.dateOfBirth;
  document.getElementById('phoneNumber').value = user.phoneNumber;
  document.getElementById('emergencyContact').value = user.emergencyContact;
};

document.getElementById('personForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateOfBirth = document.getElementById('dateOfBirth').value??"";
  const phoneNumber = document.getElementById('phoneNumber').value??"";
  const emergencyContact = document.getElementById('emergencyContact').value??"";

  try {
    const response = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dateOfBirth, phoneNumber, emergencyContact }),
    });
    console.log(response.ok);
    if(response.ok){
      await response.json();
      for( const _field of document.getElementsByClassName('is-invalid')){
        _field.classList.remove('is-invalid');
      }
    } else {
      console.log("asd");
      await response.json().then(res => {
        res.error.errorFields.map(er=>{
          document.getElementById(er).classList.add('is-invalid');
        })
      });
    }
  } catch (error) {
    showError('Hiba történt a profilod módosítása.');
  }
});

document.addEventListener('DOMContentLoaded', loadProfile);
//endregion

let cropper;

const uploadProfilePic = async (e) => {
  e.target.removeEventListener('change', uploadProfilePic);

  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = document.getElementById('cropImg');

    img.src = reader.result;
    img.style.display = "block";

    if (cropper) {
      cropper.destroy();
    }

    document.getElementById('profilePicBody').style.height = "60vh";

    cropper = new Cropper(img, {
      aspectRatio: 1,
      viewMode: 3,
      autoCropArea: 1,
      dragMode: 'move',
      cropBoxResizable: true,
      cropBoxMovable: true,
      zoomable: true,
      scalable: false,
      rotatable: false,
    });

    document.getElementById('doneProfileCrop').disabled = false;
  };
  reader.readAsDataURL(file);

  document.getElementById('doneProfileCrop').addEventListener('click', async (e) => {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
      width: 500,
      height: 500,
    });

    canvas.toBlob(async (blob) => {
      const res = await fetch('/api/v1/me/profilePicture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: blob,
      });
      if (res.status === 201) {
        bootstrap.Modal.getOrCreateInstance(
          document.getElementById('profilePicCutModal'),
        ).hide();
        await loadUserData();
        updateAuthUI(user);
        await loadProfile();
      } else if (res.status === 413) {
        showError('A kép túl nagy, válassz egy kisebb felbontásút!');
      }
    });
  });
  e.target.addEventListener('change', uploadProfilePic);
};

document.getElementById('profilePickCsere').addEventListener('click', (e) => {
  const profilePicCutModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById('profilePicCutModal'),
  );
  profilePicCutModal.show();
  document
    .getElementById('profilePicCutModal')
    .addEventListener('hidden.bs.modal', () => {
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      document.getElementById('profilePicBody').style.height = 'fit-content';
    });
  document.getElementById('profilePicPicker').addEventListener('change',  uploadProfilePic);
});

document
  .getElementById('removePictureBtn')
  .addEventListener('click', async (e) => {
    const response = await fetch('/api/v1/me/profilePicture', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (response.status === 203) {
      await loadUserData();
      updateAuthUI(user);
      await loadProfile();
    } else {
      showError('Nem tudtuk törölni a profilképed, kérlek próbáld újra!');
    }
  });



//region password change
document
  .getElementById('passwordUpdateForm')
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const newPasswordConfirm =
      document.getElementById('newPasswordConfirm').value;
    if (newPassword !== newPasswordConfirm) {
      showError('A megadott jelszavak nem eggyeznek.');
    } else {
      const resoult = await fetch(
        `${window.location.origin}/api/v1/me/changePassword`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            oldPassword,
            password: newPassword,
          }),
        },
      );

      if (resoult.status === 202) {
        await loadUserData();
        updateAuthUI(user);
      } else {
        showError('Valami hiba történt jelszó változtatás közben!');
      }
    }
  });

//endregion

document
  .getElementById('deleteAccountButton')
  .addEventListener('click', async (e) => {
    await fetch('/api/v1/me', {
      method: 'DELETE',
    });
    bootstrap.Modal.getInstance(
      document.getElementById('deleteAccountModal'),
    ).hide();
    await loadUserData();
    updateAuthUI(user);
    window.location.reload();
  });