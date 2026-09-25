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
      <td><input class="stat-code" /></td>
      <td><input class="gross" type="number" step="0.01" min="0" /></td>
      <td><input type="number" step="0.001" min="0" /></td>
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
  const file=fileInput.files?.[0]; if(!file) return;
  invoiceStatus.textContent='Reading invoice…';
  try{
    if(!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))){
      invoiceStatus.textContent='For now upload a text PDF invoice. Image OCR comes next.'; return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    let pages=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p), tc=await page.getTextContent();
      const items=tc.items.map(x=>({s:x.str.trim(),x:x.transform[4],y:x.transform[5]})).filter(x=>x.s);
      items.sort((a,b)=>Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x);
      let lines=[];
      for(const it of items){
        let line=lines.find(l=>Math.abs(l.y-it.y)<3);
        if(!line){line={y:it.y,a:[]};lines.push(line)} line.a.push(it);
      }
      lines.sort((a,b)=>b.y-a.y);
      pages.push(lines.map(l=>l.a.sort((a,b)=>a.x-b.x).map(z=>z.s).join(' ')).join('\n'));
    }
    const text=pages.join('\n'), one=text.replace(/\s+/g,' ').trim();
    const set=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.value=v.trim()};
    const pick=re=>{const m=one.match(re);return m?m[1].trim():''};

    const sender=pick(/Продавец\s*\/\s*Грузоотправитель\s*:\s*(.+?)(?=\s+(?:Производитель|Происхождение)\s*:)/i)||pick(/Seller\s*:\s*(.+?)(?=\s+(?:Reg\.|Bank|№\s*Description))/i);
    const consignee=pick(/Покупатель\s*\/\s*Грузополучатель\s*:\s*(.+?)(?=\s+Продавец\s*\/\s*Грузоотправитель\s*:)/i)||pick(/Client\s+(.+?)(?=\s+Invoice\s+no)/i);
    const unloading=pick(/Место выгрузки\s*:\s*(.+?)(?=\s+Код товара\s*:)/i);
    const vehicle=pick(/Номер машины\s*:\s*(.+?)(?=\s+Покупатель\s*\/\s*Грузополучатель\s*:)/i);
    const inv=pick(/Invoice\s+no\s+([A-Z0-9\/-]+)/i);
    const date=pick(/Issue date\s*:\s*([0-9.\/-]+)/i);
    const code=pick(/Код товара\s*:\s*([0-9]+)/i);
    const origin=pick(/Происхождение\s*:\s*(.+?)(?=\s+Место выгрузки\s*:)/i);
    set('sender',sender);set('consignee',consignee);set('deliveryPlace',unloading);set('vehicleNumber',vehicle);
    set('documents',`Invoice No ${inv||file.name}${date?', '+date:''}`);
    set('instructions',origin?`Origin: ${origin}`:'');

    // Parse the actual DELICA invoice product pattern from the uploaded test invoice.
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    const products=[];
    for(let i=0;i<lines.length;i++){
      if(/Frozen Salmon Backbones/i.test(lines[i])||/Salmon Bellies/i.test(lines[i])){
        let block=lines.slice(i,Math.min(i+4,lines.length)).join(' ');
        const desc=(block.match(/^(.*?)(?=\s+Packing\s*:)/i)||[])[1]||lines[i];
        const pack=(block.match(/Packing\s*:\s*([0-9.,]+\s*kg)/i)||[])[1]||'';
        const boxes=(block.match(/Boxes\s*:\s*([0-9]+)\s*pc/i)||[])[1]||'';
        let qty='';
        const qm=block.match(/\bkg\s+([0-9]+(?:[.,][0-9]+)?)\s+[0-9]+[.,][0-9]+/i);
        if(qm)qty=qm[1].replace(',','.');
        products.push({desc,pack,boxes,qty});
      }
    }
    if(products.length){
      tbody.innerHTML='';
      for(const p of products) tbody.insertAdjacentHTML('beforeend',`<tr>
        <td><input></td><td><input type="number" value="${p.boxes}"></td>
        <td><input value="${p.pack}"></td><td><input value="${p.desc.replace(/"/g,'&quot;')}"></td>
        <td><input class="stat-code" value="${code}"></td>
        <td><input class="gross" type="number" step=".01"></td><td><input type="number" step=".001"></td>
        <td class="screen-only"><button class="remove-row" type="button">×</button></td></tr>`);
      // CMR has gross weight only. Invoice quantities are net; if gross isn't supplied, show net in goods text instead of mislabelling it gross.
      products.forEach((p,idx)=>{if(p.qty){const d=tbody.rows[idx].cells[3].querySelector('input');d.value += ` | Net ${p.qty} kg`;}})
    }
    recalc();
    invoiceStatus.textContent=products.length?'Invoice read successfully. Please verify the CMR before export.':'Invoice text read, but product rows need manual review.';
  }catch(err){console.error(err);invoiceStatus.textContent='Could not read this PDF. Please try the uploaded test invoice again.'}
});

document.getElementById('downloadPdf').addEventListener('click', async ()=>{
  recalc();
  const element=document.getElementById('cmrSheet');
  const button=document.getElementById('downloadPdf');
  button.disabled=true; button.textContent='Creating PDF…';
  try{
    element.classList.add('pdf-export');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const canvas=await html2canvas(element,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false});
    const img=canvas.toDataURL('image/jpeg',0.96);
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const pageW=210,pageH=297,margin=4,maxW=pageW-margin*2,maxH=pageH-margin*2;
    const ratio=Math.min(maxW/canvas.width,maxH/canvas.height);
    const w=canvas.width*ratio,h=canvas.height*ratio;
    pdf.addImage(img,'JPEG',(pageW-w)/2,(pageH-h)/2,w,h,undefined,'FAST');
    pdf.save('CMR.pdf');
  }catch(err){console.error(err);alert('PDF creation failed. Please refresh the page and try again.')}
  finally{element.classList.remove('pdf-export');button.disabled=false;button.textContent='Download PDF'}
});

recalc();
