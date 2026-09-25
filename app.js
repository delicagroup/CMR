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

const processInvoice = document.getElementById('processInvoice');
const invoiceStatus = document.getElementById('invoiceStatus');

fileInput.addEventListener('change',()=>{
  const file = fileInput.files?.[0];
  fileName.textContent = file?.name || 'No file selected';
  processInvoice.disabled = !file;
  invoiceStatus.textContent = file ? 'Invoice ready to read.' : '';
});

processInvoice.addEventListener('click', async ()=>{
  const file = fileInput.files?.[0];
  if(!file) return;
  invoiceStatus.textContent = 'Reading invoice…';
  try{
    let text = '';
    if(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')){
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({data}).promise;
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const content=await page.getTextContent();
        text += content.items.map(i=>i.str).join(' ')+'\n';
      }
    } else {
      invoiceStatus.textContent='Image selected. OCR will be connected in the next version; PDF invoices can already be read.';
      return;
    }
    const lines=text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
    document.getElementById('documents').value = 'Invoice: ' + file.name;
    const weight=text.match(/(?:net(?:to)?\s*(?:weight)?|net)[^0-9]{0,15}([0-9][0-9 .,'’]*)(?:\s*kg)/i);
    const gross=text.match(/(?:gross(?:\s*weight)?|brutto)[^0-9]{0,15}([0-9][0-9 .,'’]*)(?:\s*kg)/i);
    const clean=n=>parseFloat(n.replace(/[ '’]/g,'').replace(',','.'));
    if(weight && document.querySelector('.net')) document.querySelector('.net').value=clean(weight[1])||'';
    if(gross && document.querySelector('.gross')) document.querySelector('.gross').value=clean(gross[1])||'';
    recalc();
    invoiceStatus.textContent = 'Invoice read. Check the extracted fields and complete anything missing.';
  }catch(err){
    console.error(err);
    invoiceStatus.textContent='Could not read this invoice. You can still fill the CMR manually.';
  }
});

document.getElementById('downloadPdf').addEventListener('click',()=>{
  recalc();
  const element = document.getElementById('cmrSheet');
  element.classList.add('pdf-export');
  const opt = {
    margin: 0,
    filename: 'CMR.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css','legacy'] }
  };
  html2pdf().set(opt).from(element).save().then(()=>element.classList.remove('pdf-export')).catch(()=>element.classList.remove('pdf-export'));
});

recalc();
