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
      <td><input class="gross" type="number" step="0.01" min="0" /></td>
      <td><input type="number" step="0.001" min="0" /></td>
      <td><input class="net" type="number" step="0.01" min="0" /></td>
      <td class="screen-only"><button class="remove-row" type="button">×</button></td>
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
      invoiceStatus.textContent='Image selected. OCR for scanned invoices will be added next.';
      return;
    }

    const one=text.replace(/\s+/g,' ').trim();
    const set=(id,val)=>{ if(val && document.getElementById(id)) document.getElementById(id).value=val.trim(); };
    const pick=(re)=>{ const m=one.match(re); return m ? m[1].trim() : ''; };

    // DELICA / Merit-style invoices: prefer explicit logistics notes when present.
    const consignee = pick(/(?:Покупатель\/Грузополучатель|Buyer\/Consignee)\s*:\s*(.+?)(?=\s+(?:Продавец\/\s*Грузоотправитель|Seller\/Consignor|Производитель|Manufacturer)\s*:)/i);
    const sender = pick(/(?:Продавец\/\s*Грузоотправитель|Seller\/Consignor)\s*:\s*(.+?)(?=\s+(?:Производитель|Manufacturer|Происхождение|Origin)\s*:)/i);
    const unloading = pick(/(?:Место выгрузки|Place of unloading)\s*:\s*(.+?)(?=\s+(?:Код товара|Commodity code|Сроки поставки|Delivery terms)\s*:)/i);
    const vehicle = pick(/(?:Номер машины|Vehicle(?: registration)?|Truck)\s*:\s*(.+?)(?=\s+(?:Покупатель\/Грузополучатель|Buyer\/Consignee)\s*:)/i);
    const invoiceNo = pick(/Invoice\s*(?:no|No\.?|№)\s*([A-Z0-9\/-]+)/i);
    const issueDate = pick(/Issue date\s*:\s*([0-9.\/-]+)/i);
    const origin = pick(/(?:Происхождение|Origin)\s*:\s*(.+?)(?=\s+(?:Место выгрузки|Place of unloading)\s*:)/i);
    const code = pick(/(?:Код товара|Commodity code|HS code)\s*:\s*([0-9]+)/i);

    set('sender', sender || pick(/Seller:\s*(.+?)(?=\s+(?:Bank name|№ Description|Description))/i));
    set('consignee', consignee || pick(/Client\s+(.+?)(?=\s+Invoice\s*(?:no|No|№))/i));
    set('deliveryPlace', unloading);
    set('vehicleNumber', vehicle);
    set('documents', 'Invoice No ' + (invoiceNo || file.name) + (issueDate ? ', '+issueDate : ''));
    set('instructions', origin ? 'Origin: '+origin : '');

    // Product rows: recognize description + Packing + Boxes + kg quantity.
    const productRe=/(Frozen\s+Salmon\s+Backbones[^]*?|Salmon\s+Bellies[^]*?)(?=(?:\s+\d+\.\s+)?(?:Frozen\s+Salmon|Salmon\s+Bellies)|Amount\s+w\/o\s+VAT|TOTAL)/gi;
    const blocks=[...text.matchAll(productRe)].map(m=>m[1]);
    if(blocks.length){
      tbody.innerHTML='';
      blocks.forEach(block=>{
        const compact=block.replace(/\s+/g,' ');
        const desc=(compact.match(/^(.*?)(?=\s+Packing\s*:)/i)||[])[1] || compact.slice(0,100);
        const packing=(compact.match(/Packing\s*:\s*([0-9.,]+\s*kg)/i)||[])[1] || '';
        const boxes=(compact.match(/Boxes\s*:\s*([0-9]+)\s*pc/i)||[])[1] || '';
        // quantity is the kg value appearing after "pc" in these invoices
        const qty=(compact.match(/Boxes\s*:\s*[0-9]+\s*pc\s*(?:kg\s*)?([0-9]+(?:[.,][0-9]+)?)/i)||[])[1] || '';
        tbody.insertAdjacentHTML('beforeend', `<tr>
          <td><input value=""></td>
          <td><input type="number" value="${boxes}"></td>
          <td><input value="${packing.replace(/"/g,'&quot;')}"></td>
          <td><input value="${desc.replace(/"/g,'&quot;')}"></td>
          <td><input class="gross" type="number" step="0.01"></td>
          <td><input type="number" step="0.001"></td>
          <td><input class="net" type="number" step="0.01" value="${qty.replace(',','.')}"></td>
          <td class="screen-only"><button class="remove-row" type="button">×</button></td>
        </tr>`);
      });
    }

    // Fallback totals when explicitly printed.
    const net=one.match(/(?:Нетто|Net(?: weight)?)[^0-9]{0,20}([0-9][0-9 .,'’]*)\s*kg/i);
    const gross=one.match(/(?:Брутто|Gross(?: weight)?)[^0-9]{0,20}([0-9][0-9 .,'’]*)\s*kg/i);
    const clean=n=>parseFloat(n.replace(/[ '’]/g,'').replace(',','.'));
    if(net && !blocks.length && document.querySelector('.net')) document.querySelector('.net').value=clean(net[1])||'';
    if(gross && document.querySelector('.gross')) document.querySelector('.gross').value=clean(gross[1])||'';

    // If one commodity code applies to the whole invoice, put it in marks/reference column.
    if(code) [...tbody.querySelectorAll('tr')].forEach(tr=>{ const i=tr.querySelector('td:first-child input'); if(i && !i.value)i.value=code; });
    recalc();
    invoiceStatus.textContent = 'Invoice read. CMR fields were filled automatically — please verify before export.';
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
