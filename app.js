function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}\nconst tbody = document.querySelector('#goodsTable tbody');
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
  invoiceStatus.textContent='AI is analyzing the complete invoice…';
  processInvoice.disabled=true;
  try{
    const base64=await new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(String(r.result).split(',')[1]);
      r.onerror=reject;
      r.readAsDataURL(file);
    });
    const res=await fetch('/api/analyze',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({filename:file.name,mimeType:file.type||'application/pdf',base64})
    });
    const body=await res.json();
    if(!res.ok) throw new Error(body.error||'Analysis failed');
    const d=body.data||{};
    const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!==undefined&&v!==null)el.value=String(v)};

    const sender=[d.sender?.name,d.sender?.address,d.sender?.country].filter(Boolean).join('\n');
    const consignee=[d.consignee?.name,d.consignee?.address,d.consignee?.country].filter(Boolean).join('\n');
    const carrier=[d.carrier?.name,d.carrier?.address,d.carrier?.country].filter(Boolean).join('\n');
    set('sender',sender); set('consignee',consignee); set('carrier',carrier);
    set('deliveryPlace',[d.delivery?.place,d.delivery?.address,d.delivery?.country].filter(Boolean).join('\n'));
    set('loadingPlace',[d.loading?.place,d.loading?.address,d.loading?.country,d.loading?.date,d.loading?.time].filter(Boolean).join('\n'));
    set('vehicleNumber',[d.vehicle?.truck,d.vehicle?.trailer].filter(Boolean).join(' / '));
    set('documents',[d.invoice?.number&&('Invoice '+d.invoice.number),d.invoice?.date,d.packing_list_number&&('Packing list '+d.packing_list_number)].filter(Boolean).join(', '));
    const instructions=[
      d.origin_country&&('Origin: '+d.origin_country),
      d.temperature&&('Temperature: '+d.temperature),
      d.incoterms&&('Incoterms: '+d.incoterms),
      d.manufacturer?.name&&('Manufacturer: '+[d.manufacturer.name,d.manufacturer.address,d.manufacturer.country].filter(Boolean).join(', '))
    ].filter(Boolean).join('\n');
    set('instructions',instructions);

    const items=Array.isArray(d.items)?d.items:[];
    if(items.length){
      tbody.innerHTML='';
      for(const p of items){
        const netNote=p.net_weight_kg!=null?(' | Net '+p.net_weight_kg+' kg'):'';
        tbody.insertAdjacentHTML('beforeend',`<tr>
          <td><input value="${esc(p.marks||'')}"></td>
          <td><input type="number" value="${esc(p.packages_count??'')}"></td>
          <td><input value="${esc(p.packaging||'')}"></td>
          <td><input value="${esc((p.description||'')+netNote)}"></td>
          <td><input class="stat-code" value="${esc(p.hs_code||d.hs_code||'')}"></td>
          <td><input class="gross" type="number" step=".01" value="${esc(p.gross_weight_kg??'')}"></td>
          <td><input type="number" step=".001" value="${esc(p.volume_m3??'')}"></td>
          <td class="screen-only"><button class="remove-row" type="button">×</button></td>
        </tr>`);
      }
    }
    recalc();
    const missing=[];
    if(!d.sender?.name) missing.push('sender');
    if(!d.consignee?.name) missing.push('consignee');
    if(!items.length) missing.push('goods');
    invoiceStatus.textContent=missing.length
      ? 'Invoice analyzed. Please check: '+missing.join(', ')+'.'
      : 'Invoice analyzed successfully. Please verify the CMR before export.';
  }catch(err){
    console.error(err);
    invoiceStatus.textContent='AI analysis failed: '+err.message;
  }finally{
    processInvoice.disabled=false;
  }
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
