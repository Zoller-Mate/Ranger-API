document.addEventListener('DOMContentLoaded', async () => {
  if (!user) {
    await loadUserData();
    updateAuthUI(user);
  }
  const code = window.location.pathname.split('/').findLast(() => true);
  console.log(code);
  if (user) {
    await joinCamp();
    updateAuthUI(user)
  } else {
    document.getElementById('mainMsg').innerHTML = 'Nem vagy bejelentkezve';
    document.getElementById('confirmMsg').innerHTML =
      'Jelentkezz be, hogy csatlakozni tudj a táborba!';
    $('#loginForm').off('submit').on('submit', async e => {
      await login(e, false);
      await joinCamp(code);
    });
  }
});

async function joinCamp(code) {
  if (user) {
    const res = await fetch(`/api/v1/camps/${code}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }).then(async (res) => await res.json());
    if (res.status === 'Created') {
      document.getElementById('mainMsg').innerHTML =
        'Sikeresen csatlakoztál a táborba.';
      document.getElementById('confirmMsg').innerHTML =
        'Várd meg míg a szervező elfogadja a kérésed!';
    } else {
      document.getElementById('mainMsg').innerHTML =
        'Nem sikerült csatlakozni a táborba.';
      document.getElementById('confirmMsg').innerHTML =
        'A kód hibás, vagy már tagja vagy a tábprnak.';
    }
  }
}