let campId;
let campData = {};
let participants = [];
let payments = [];

//region dataForm

function loadCampToForm(){
  document.getElementById('name').value = campData.campName;
  document.getElementById('joinCode').value = campData.joinCode;
  document.getElementById('startDate').value = campData.startDate;
  document.getElementById('endDate').value = campData.endDate;
  document.getElementById('minGroupSize').value = campData.minGroupSize;
}

async function loadCampData() {
  const res = await (
    await fetch(`/api/v1/camps/${campId}`)
  ).json();
  if (res.status === 'OK') {
    campData = res.data;
    loadCampToForm();
  } else {
    showError("Nem tudtuk betölteni a tábor informűcióit, kérlek próbáld újra");
  }
}
//endregion

//region participants

function loadParticipantPayments(id) {
  const body = document.getElementById(
    'participantPaymentTableBody',
  );
  body.innerHTML = '';
  participants
    .find((p) => p.id === id)
    ?.payments.forEach((p) => {
      body.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td class="text-center">
          <input class="form-check-input paymentInput" type="checkbox" data-paymentid="${p.id}" ${p.isPaid ? 'checked' : ''}>
        </td>
      </tr>
    `;
    });
  [...document.getElementsByClassName('paymentInput')].forEach((cbx) => {
    cbx.addEventListener('change', async (e) => {
      const res = await fetch(
        `/api/v1/camps/${campId}/participants/${id}/payments/${e.target.dataset.paymentid}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            state: e.target.checked ? 'paid' : 'unpaid',
          }),
        },
      );
      if (res.status === 202) {
        console.log(e.target.checked);
        participants
          .find((p) => p.id === id)
          .payments.find((p) => p.id === e.target.dataset.paymentid).isPaid =
          e.target.checked;
      } else {
        e.target.checked = !e.target.checked;
        showError(
          'Nem tudtuk frissíteni a fizetés státuszát, kérlek próbáld újra.',
        );
      }
    });
  });

  bootstrap.Modal.getOrCreateInstance(
    document.getElementById('participantPaymentModal'),
  ).show();
}

function showKickPanel(id) {
  document.getElementById('kickSubmitBtn').dataset.participantid = id;
  bootstrap.Modal.getOrCreateInstance(
    document.getElementById('kickParticipantModal'),
  ).show();
}

async function kickParticipant(e) {
  const id = e.target.dataset.participantid;
  await fetch(`/api/v1/camps/${campId}/participants/${id}`, {
    method: 'DELETE',
  });
  participants.splice(
    participants.findIndex((p) => p.id === id),
    1,
  );
  loadParticipantsToTable();
  bootstrap.Modal.getInstance(
    document.getElementById('kickParticipantModal'),
  ).hide();
}

function loadParticipantsToTable() {
  const body = document.getElementById('participantsTableBody');
  body.innerHTML = '';
  participants.filter((p) => p.id != user.id).forEach(participant => {
    body.innerHTML += `
    <tr>
      <td>${participant.name}</td>
      <td>${participant.email}</td>
      <td>
        <select class="form-select role-select w-50" data-participantid="${participant.id}">
          ${participant.role === 'Pending' ? '<option value="Pending" selected>Elfogadásra vár</option>' : ''}
          <option value="Camper" ${participant.role === 'Camper' ? 'selected' : ''}>Táborozó</option>
          <option value="Staff" ${participant.role === 'Staff' ? 'selected' : ''}>Munkatárs</option>
        </select>
      </td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-2 payment-btn" data-participantid="${participant.id}">Fizetések</button>
        <button class="btn btn-sm btn-outline-secondary me-2 more-btn" data-participantid="${participant.id}">Több</button>
        <button class="btn btn-sm btn-outline-danger kick-btn" data-participantid="${participant.id}">Kirúgás</button>
      </td>
    </tr>
  `;
  });
  [...document.getElementsByClassName('payment-btn')].forEach((btn) => {
    btn.addEventListener('click', (event) => {
      loadParticipantPayments(event.target.dataset.participantid);
    });
  });

  [...document.getElementsByClassName('role-select')].forEach((btn) => {
    btn.addEventListener('change', async (event) => {
      await changeUerRole(event.target.dataset.participantid, event.target.value);
    });
  });

  [...document.getElementsByClassName('kick-btn')].forEach((btn) => {
    btn.addEventListener('click', (event) => {
      showKickPanel(event.target.dataset.participantid);
    });
  });

  [...document.getElementsByClassName('more-btn')].forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const participant = participants.find(
        (p) => e.target.dataset.participantid === p.id,
      );
      console.log(participant);
      document.getElementById('participantModalProfilePic').src = participant.profilePicture ? `${participant.profilePicture}` : '/defaultProfilePic.png';
      document.getElementById('participantModalName').innerHTML = participant.name;
      document.getElementById('participantModalEmail').innerHTML = participant.email;
      document.getElementById('participantModalBirthDate').innerHTML = participant.dateOfBirth?.replace(/-/g, '.')??'-';
      document.getElementById('participantModalRole').innerHTML = participant.role;
      document.getElementById('participantModalPhoneNum').innerHTML = participant.phoneNumber??'-';
      document.getElementById('participantModalContact').innerHTML = participant.emergencyContact??'-';


        bootstrap.Modal.getOrCreateInstance(
          document.getElementById('participantModal'),
        ).show();
    });
  });
}

async function loadParticipants(){
  const res = await (
    await fetch(`/api/v1/camps/${campId}/participants`)
  ).json();
  if (res.status === 'OK') {
    participants = res.data;
    loadParticipantsToTable();
  } else {
    showError('Nem sikerült a táborozókat betölteni, kérlek próbáld újra!');
  }
}
//endregion

//region payments
function loadPaymentsToTable() {
  const body = document.getElementById('paymentsTableBody');
  body.innerHTML = '';
  payments.forEach((payment) => {
    body.innerHTML += `
    <tr>
      <td>${payment.name}</td>
      <td>${payment.dueDate.replace(/-/g, '.')}</td>
      <td>${payment.amount} ${payment.currency}</td>
      <td>
        <button class="btn btn-outline-secondary editPaymentBtn" data-paymentid="${payment.id}">Módostítás</button>
        <button class="btn btn-outline-danger deletePaymentBtn" data-paymentid="${payment.id}">Törlés</button>
      </td>
    </tr>`;
  });

  [...document.getElementsByClassName('editPaymentBtn')].forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const _id = event.target.dataset.paymentid;
      const _payment = payments.find((p)=>p.id===_id);
      if (!_payment) {
        showError('Hiba történt a fizetés kiválasztásánál!');
        window.location.reload();
      }
      document.getElementById('paymentForm').dataset.paymentid = _payment.id;
      document.getElementById('paymentName').value = _payment.name;
      document.getElementById('paymentAmount').value = _payment.amount;
      document.getElementById('paymentDueDate').value = _payment.dueDate;
      document.getElementById('paymentCurrency').value = _payment.currency;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('paymentModal')).show();
    });
  });

  [...document.getElementsByClassName('deletePaymentBtn')].forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const _id = event.target.dataset.paymentid;
      document.getElementById('deletePaymentSubmit').dataset.paymentid = _id;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('deletePaymentModal')).show();
    });
  });
}

document
  .getElementById('deletePaymentSubmit')
  .addEventListener('click', async (e) => {
    const res = await fetch(
      `/api/v1/camps/${campId}/payments/${e.target.dataset.paymentid}`,
      {
        method: 'DELETE',
      },
    );
    if (res.status === 204) {
      bootstrap.Modal.getInstance(
        document.getElementById('deletePaymentModal'),
      ).hide();
      await loadParticipants();
      await loadPayments();
    }
  });

async function loadPayments() {
  const res = await (await fetch(`/api/v1/camps/${campId}/payments`)).json();
  if (res.status === 'OK') {
    payments = res.data;
    loadPaymentsToTable();
  } else {
    showError('Nem sikerült a fizetéseket betölteni, kérlek próbáld újra!');
  }
}

//endregion

async function changeUerRole(id, role){
  try{
    const res = await fetch(`/api/v1/camps/${campId}/participants/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        role,
      }),
    });
    if (res.status === 202) {
      await loadParticipants();
    }
  } catch (error) {
    showError("Nem tudtuk a felhasználó szerepét változtatni, kérlek próbáld újra!");
    await loadParticipants();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  campId = document.getElementById('campId').innerText;
  if (campId) {
    if (!user) await loadUserData();
    if (user) {
      await loadCampData();
      await loadParticipants();
      await loadPayments();
    }
  } else {
    showError('Kérlek töltsd újra az oldalt, a tábort nem tudjuk betölteni!');
  }
  //region dataForm
  document.getElementById('campDataForm').addEventListener('reset', (e) => {
    e.preventDefault();
    loadCampData();
  });

  document
    .getElementById('campDataForm')
    .addEventListener('submit', async (e) => {
      e.preventDefault();
      const modifiedCampData = {
        name: document.getElementById('name').value,
        joinCode: document.getElementById('joinCode').value.toUpperCase(),
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        minGroupSize: document.getElementById('minGroupSize').value,
      };
      const res = await fetch(
        `/api/v1/camps/${document.getElementById('campId').innerText}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(modifiedCampData),
        },
      );
      if (res.status === 202) {
        campData = {
          ...campData,
          campName: modifiedCampData.name,
          joinCode: modifiedCampData.joinCode,
          startDate: modifiedCampData.startDate,
          endDate: modifiedCampData.endDate,
          minGroupSize: modifiedCampData.minGroupSize,
        };
        loadCampToForm();
      } else {
        loadCampToForm();
      }
    });
  //endregion

  document
    .getElementById('kickSubmitBtn')
    .addEventListener('click', kickParticipant);

  $('#downloadQRCode').on('click', async (e) => {
    const res = await fetch(`/api/v1/camps/${campId}/joinQrCode/download`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${campData.campName}_join_Qrcode.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

});

document.getElementById('deleteCampBtn').addEventListener('click', (e) => {
  bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteCampModal')).show();
});

document
  .getElementById('deleteCampConfirmButton')
  .addEventListener('click', async (e) => {
    const res = await fetch(`/api/v1/camps/${campId}`, {
      method: 'DELETE',
    });
    if (res.status === 204) {
      window.location = "/camps";
    } else {
      showError('Nem sikerült törölni a tábort, kérlek próbáld újra.');
    }
  });

document
  .getElementById('addPaymentBtn')
  .addEventListener('click', async (e) => {
    document.getElementById("paymentForm").dataset.paymentid = '';
    bootstrap.Modal.getOrCreateInstance(
      document.getElementById('paymentModal'),
    ).show();
  });

document
  .getElementById('paymentModal')
  .addEventListener('hidden.bs.modal', async (e) => {
    document.getElementById('paymentForm').reset();
  });

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('paymentName').value;
  const amount = document.getElementById('paymentAmount').value;
  const dueDate = document.getElementById('paymentDueDate').value;
  const currency = document.getElementById('paymentCurrency').value;
  if (!e.target.dataset.paymentid) {
    const res = await fetch(`/api/v1/camps/${campId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        amount,
        dueDate,
        currency,
      }),
    });
    if (res.status === 201) {
      await loadParticipants();
      await loadPayments();
      bootstrap.Modal.getInstance(
        document.getElementById('paymentModal'),
      ).hide();
    } else {
      showError('Nem tudtuk létrehozni a befizetést, kérlek próbáld újra.');
    }
  } else {
    const res = await fetch(
      `/api/v1/camps/${campId}/payments/${e.target.dataset.paymentid}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          amount,
          dueDate,
          currency,
        }),
      },
    );
    if (res.status === 202) {
      await loadParticipants();
      await loadPayments();
      bootstrap.Modal.getInstance(
        document.getElementById('paymentModal'),
      ).hide();
    } else {
      showError('Nem tudtuk módosítani a befizetést, kérlek próbáld újra.');
    }
  }
});