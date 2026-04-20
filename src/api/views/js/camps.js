let joinedCamps = [];
let ownedCamps = [];

function showCamps(type){
  const cardHolder = document.getElementById('cardHolder');
  if(type === "owned"){
    cardHolder.innerHTML = `
      <div class="col-md-6 col-lg-4 col-12" id="createCamp">
        <div class="card camp-card add-card text-center">
          <div class="card-body d-flex flex-column justify-content-center align-items-center">
            <div class="add-icon mb-3">
              <i class="bi bi-plus-lg"></i>
            </div>
            <h3 class="card-title fw-bold">Új tábor</h3>
          </div>
        </div>
      </div>
    `;
    ownedCamps.forEach(camp => {
      cardHolder.innerHTML += `
      <div class="col-md-6 col-lg-4 col-12">
        <div class="card camp-card">
          <div class="camp-strip"></div>
          <div class="card-body">
            <h3 class="card-title fw-bold">
              ${camp.campName}
            </h3>
            <p class="mb-2">
              <i class="bi bi-alphabet-uppercase me-2"></i>
              <strong> Csatlakozási kód:</strong> ${camp.joinCode}
            </p>      
            <p class="mb-3">
              <i class="bi bi-calendar2-range-fill me-2"></i>
              <strong>&nbsp;Dátum:</strong> ${camp.startDate.replace(/-/g, '.')} &rarr; ${camp.endDate.replace(/-/g, '.')}
            </p>
            <div class="text-end">
              <a href="/camps/${camp.campId}" class="btn btn-outline-secondary btn-lg">
                Több<i class="bi bi-arrow-right"></i>
              </a>
            </div>
          </div>
        </div>
      </div>`;
    });
      document.getElementById('createCamp').addEventListener('click', () => {
        if (user) {
          bootstrap.Modal.getOrCreateInstance(
            document.getElementById('createCampModal'),
          ).show();
        }
      });
  } else {
    cardHolder.innerHTML = `
      <div class="col-md-6 col-lg-4 col-12" id="joinCamp">
        <div class="card camp-card add-card text-center">
          <div class="card-body d-flex flex-column justify-content-center align-items-center">
            <div class="add-icon mb-3">
              <i class="bi bi-plus-lg"></i>
            </div>
            <h3 class="card-title fw-bold">Csatlakozás Táborba</h3>
          </div>
        </div>
      </div>
    `;
    joinedCamps.forEach((camp) => {
      console.log(camp);
      cardHolder.innerHTML += `
      <div class="col-md-6 col-lg-4 col-12">
        <div class="card camp-card">
          <div class="camp-strip"></div>
          <div class="card-body">
            <h3 class="card-title fw-bold">
              ${camp.campName}
            </h3>
            <p class="mb-2">
              <i class="bi bi-alphabet-uppercase me-2"></i>
              <strong> Csatlakozási kód:</strong> ${camp.joinCode}
            </p>            
            <p class="mb-2">
              <i class="bi bi-calendar2-range-fill me-2"></i>
              <strong>&nbsp;Dátum:</strong> ${camp.startDate}-${camp.endDate}
            </p>
            <p class="mb-3">
              <i class="bi ${camp.role === 'Pending' ? 'bi-person-fill-exclamation' : 'bi-person-fill-check'} me-2"></i>
              <strong>&nbsp;Szerep:</strong> ${camp.role}
            </p>
            ${
              camp.role !== 'Pending'
                ? `<div class="text-end">
              <a href="/camps/${camp.campId}" class="btn btn-outline-secondary btn-lg">
                Több<i class="bi bi-arrow-right"></i>
              </a>
            </div>`
                : ''
            }
          </div>
        </div>
      </div>`;
    });
    document.getElementById('joinCamp').addEventListener('click', () => {
      if (user) {
        bootstrap.Modal.getOrCreateInstance(
          document.getElementById('joinCampModal'),
        ).show();
      }
    });
  }
}

async function loadCamps() {
  if (!user) await loadUserData();
  if (user) {
    const resoult = await (
      await fetch('/api/v1/camps', {
        method: 'GET',
      })
    ).json();
    if (resoult.status === 'OK') {
      const camps = resoult.data;
      camps.sort((a, b)=> new Date(a.startDate)-new Date(b.startDate));
      joinedCamps = camps.filter((camp) => camp.role !== 'Owner');
      ownedCamps = camps.filter((camp) => camp.role === 'Owner');
      showCamps(document.getElementById("owned").checked ? "owned" : "joined");
    } else {
      showError('Nem tudtuk betölteni a táboraidat, kérlek próbáld me újra!');
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCamps();

  document.getElementById('owned').addEventListener('change', () => {
    showCamps('owned');
  });
  document.getElementById('joined').addEventListener('change', () => {
    showCamps('joined');
  });

  document
    .getElementById('joinCampModal')
    .addEventListener('show.bs.modal', () => {
      document.getElementById('campCode').value = '';
    });

  document.getElementById('createCampModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('campForm').reset();
  });

  document
    .getElementById('campJoinForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      if (user) {
        const res = await fetch(
          `/api/v1/camps/${document.getElementById('campCode').value}`,
          {
            method: 'POST',
          },
        );
        if (res.status === 201) {
          bootstrap.Modal.getInstance(
            document.getElementById('joinCampModal'),
          ).hide();
          await loadCamps();
        } else {
          showError(
            'Nem találtunk tábort, ezzel a kóddal, kérlek ellenőrizd le újra!\nEllenőrizd, nem csatlakoztál-e már ehhez a táborhoz',
          );
        }
      }
    });

  document.getElementById('campForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log(user);
    if (user) {
      const campName = document.getElementById('campName').value;
      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      const joinCode = document.getElementById('joinCode').value;
      const minGroupSize = document.getElementById('minGroupSize').value;
      let data = { name: campName, startDate, endDate };
      if (joinCode) data = { ...data, joinCode };
      if (minGroupSize) data = { ...data, minGroupSize };
      console.log(data);
      const res = await fetch('/api/v1/camps/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (res.status === 201) {
        bootstrap.Modal.getInstance(
          document.getElementById('createCampModal'),
        ).hide();
        $('input').removeClass('is-invalid');
        await loadCamps();
      } else {
        const jRes = await res.json();
        console.log(jRes);
        if (jRes.error.errorFields) {
          jRes.error.errorFields.forEach((errorField) => {
            $(`#${errorField.field}`).addClass('is-invalid');
            showError(errorField.message);
          });
        } else {
          showError('Valamelyik adat hibás, kérlek javítsd az adatokat!');
        }
      }
    }
  });
});

