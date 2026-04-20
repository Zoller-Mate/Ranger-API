document.addEventListener('DOMContentLoaded', async () => {
  const token = window.location.pathname.split('/').findLast(()=>true);
  const res = await fetch(`/api/v1/auth/verifyEmail/${token}`,{
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }).then(async(res) => await res.json());
  if (res.status === 'Accepted') {
    document.getElementById('mainMsg').innerHTML =
      'Az email címed sikeresen megerősítetted.';
    document.getElementById('confirmMsg').innerHTML =
      'Mostmár bejelentkezhetsz a profilodba.';
  } else {
    document.getElementById('mainMsg').innerHTML =
      'Az email címed megerősítése sikertelen.';
    document.getElementById('confirmMsg').innerHTML =
      'A token vagy hibás vagy lejárt. Kérlek próbálj meg regisztrálni újra.';
  }
});