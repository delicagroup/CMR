const tbody = document.querySelector('#goodsTable tbody');
const addRow = document.getElementById('addRow');
const fileInput = document.getElementById('invoiceInput');
const fileName = document.getElementById('fileName');

function rowHtml(){
  return `
    <tr>
      <td><input /></td>
      <td><input type="number" min="0" /></td>
      <td><input placeholder="boxes" /></td>
      <td><input placeholder="Frozen fish" /></td>
      <td><input /></td>
      <td><input class="gross" type="number" step="0.01" min="0" /></td>
      <td><input type="number" step="0.001" min="0" /></td>
      <td><input class="net" type="number" step="0.01" min="0" /></td>
      <td><button class="remove-row" type="button">×</button></td>
    </tr>`;
}

function recalc(){
  const net = [...document.querySelectorAll('.net')].reduce((s,e)=>s+(parseFloat(e.value)||0),0);
  const gross = [...document.querySelectorAll('.gross')].reduce((s,e)=>s+(parseFloat(e.value)||0),0);
  document.getElementById('totalNet').textContent = net.toFixed(2) + ' kg';
  document.getElementById('totalGross').textContent = gross.toFixed(2) + ' kg';
}

addRow.addEventListener('click',()=>{tbody.insertAdjacentHTML('beforeend',rowHtml());recalc()});
tbody.addEventListener('click',e=>{
  if(e.target.classList.contains('remove-row')){
    if(tbody.rows.length>1)e.target.closest('tr').remove();
    recalc();
  }
});
tbody.addEventListener('input',recalc);

fileInput.addEventListener('change',()=>{
  fileName.textContent = fileInput.files?.[0]?.name || 'No file selected';
});

document.getElementById('downloadPdf').addEventListener('click',()=>{
  recalc();
  const element = document.getElementById('cmrSheet');
  const opt = {
    margin: 5,
    filename: 'CMR.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all','css','legacy'] }
  };
  html2pdf().set(opt).from(element).save();
});

recalc();
