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

async function loadPayments() {
  if (!user) await loadUserData();
  if (user) {
    const resoult = await (
      await fetch('/api/v1/me/payments', {
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

document.addEventListener('DOMContentLoaded', async () => {
  await loadPayments();

  document.getElementById('unPaid').addEventListener('change', () => {
    showPayments('unpaid');
  });
  document.getElementById('paid').addEventListener('change', () => {
    showPayments('paid');
  });
});

