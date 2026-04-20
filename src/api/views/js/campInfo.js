let campId = "";
let payments = [];


async function loadCampBase() {
  const res = await fetch(`/api/v1/camps/${campId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }).then(async (res) => await res.json());
  if (res.status === 'OK') {
    document.getElementById('joinCode').innerHTML = res.data.joinCode;
    document.getElementById('campName').innerHTML = res.data.campName;
    document.getElementById('startDate').innerHTML = res.data.startDate;
    document.getElementById('endDate').innerHTML = res.data.endDate;
    document.getElementById('role').innerHTML = res.data.role;
  } else {
    showError(
      'Nem tudtuk betölteni a tábor adatait, kérlek frissítsd az oldalt!',
    );
  }
}

async function loadOwnerData() {
  const res = await fetch(`/api/v1/camps/${campId}/owner`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }).then(async (res) => await res.json());
  if (res.status === 'OK') {
    document.getElementById('ownerName').innerHTML = res.data.name;
    document.getElementById('ownerEmail').innerHTML = res.data.email;
    document.getElementById('ownerPhone').innerHTML = res.data.phone;
    document.getElementById('ownerProfilePic').src = res.data.profilePic??"/defaultProfilePic.png";
  } else {
    showError(
      'Nem tudtuk betölteni a tábor adatait, kérlek frissítsd az oldalt!',
    );
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  campId = document.getElementById('campId').innerHTML;
  await loadCampBase();
  if(!!document.getElementById('payments')) await loadCampPayments();
  await loadOwnerData();

  document.getElementById('unPaid').addEventListener('change', () => {
    showPayments('unpaid');
  });
  document.getElementById('paid').addEventListener('change', () => {
    showPayments('paid');
  });

  document.getElementById('leaveCampConfirmBtn').addEventListener('click', async () => {
    const res = await fetch(`/api/v1/camps/${campId}/leave`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });
    if(res.ok){
      window.location = "/camps";
    } else {
      showError("Nem sikerült kilápni a táborból! Próbáld újra!");
    }
  })

  document.getElementById('leaveCampBtn').addEventListener('click', () => {
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById('leaveCampModal'),
    ).show();
  });
});

let unPaid = [];
let paid = [];

function showPayments(type) {
  const cardHolder = document.getElementById('cardHolder');
  cardHolder.innerHTML = '';
  if (type === 'paid') {
    paid.forEach((payment) => {
      cardHolder.innerHTML += `
      <div class="col-md-6 col-lg-4 col-12">
        <div class="card camp-card">
          <div class="camp-strip"></div>
          <div class="card-body">
            <h3 class="card-title fw-bold">
              ${payment.paymentName}
            </h3>
            <p class="mb-2">
              <i class="bi bi-compass-fill me-2"></i>
              <strong>&nbsp; Tábor:</strong> ${payment.camp}
            </p>
            <p class="mb-2">
              <i class="bi bi-calendar2-event-fill me-2"></i>
              <strong>&nbsp;Befizetési Határidő:</strong> ${payment.dueDate}
            </p>
            <p class="mb-3">
              <i class="bi bi-cash-stack me-2"></i>
              <strong>&nbsp;Összeg:</strong> ${payment.amount} ${payment.currency}
            </p>
          </div>
        </div>
      </div>`;
    });
  } else {
    unPaid.forEach((payment) => {
      cardHolder.innerHTML += `
      <div class="col-md-6 col-lg-4 col-12">
        <div class="card camp-card">
          <div class="camp-strip"></div>
          <div class="card-body">
            <h3 class="card-title fw-bold">
              ${payment.paymentName}
            </h3>
            <p class="mb-2">
              <i class="bi bi-compass-fill me-2"></i>
              <strong>&nbsp; Tábor:</strong> ${payment.camp}
            </p>
            <p class="mb-2">
              <i class="bi bi-calendar2-event-fill me-2"></i>
              <strong>&nbsp;Befizetési Határidő:</strong> ${payment.dueDate}
            </p>
            <p class="mb-3">
              <i class="bi bi-cash-stack me-2"></i>
              <strong>&nbsp;Összeg:</strong> ${payment.amount} ${payment.currency}
            </p>
          </div>
        </div>
      </div>`;
    });
  }
}

async function loadCampPayments() {
  if (!user) await loadUserData();
  if (user) {
    const resoult = await (
      await fetch(`/api/v1/camps/${campId}/payments`, {
        method: 'GET',
      })
    ).json();
    if (resoult.status === 'OK') {
      const payments = resoult.data;
      payments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      unPaid = payments.filter((payment) => !payment.isPaid);
      paid = payments.filter((payment) => payment.isPaid);
      showPayments(
        document.getElementById('unPaid').checked ? 'unpaid' : 'paid',
      );
    } else {
      showError('Nem tudtuk betölteni a fizetéseided, kérlek próbáld me újra!');
    }
  }
}