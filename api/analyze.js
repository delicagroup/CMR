export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:'OPENAI_API_KEY is not configured in Vercel'});
  try{
    const {filename,mimeType,base64}=req.body||{};
    if(!base64||!filename) return res.status(400).json({error:'Invoice file is required'});

    const schema={
      sender:{name:null,address:null,country:null,vat_number:null,registration_number:null},
      consignee:{name:null,address:null,country:null,vat_number:null,registration_number:null},
      buyer:{name:null,address:null,country:null},
      manufacturer:{name:null,address:null,country:null},
      carrier:{name:null,address:null,country:null},
      loading:{place:null,address:null,country:null,date:null,time:null},
      delivery:{place:null,address:null,country:null},
      vehicle:{truck:null,trailer:null},
      invoice:{number:null,date:null,currency:null},
      packing_list_number:null,origin_country:null,temperature:null,incoterms:null,hs_code:null,
      items:[{description:null,marks:null,packages_count:null,packaging:null,net_weight_kg:null,gross_weight_kg:null,volume_m3:null,hs_code:null}],
      totals:{packages_count:null,net_weight_kg:null,gross_weight_kg:null},
      notes:null
    };

    const prompt=`You extract logistics data from commercial invoices for preparation of a CMR consignment note.
Read the ENTIRE document visually and semantically. The invoice can be in any language and any layout.
Do not rely on fixed labels. Distinguish seller, sender/consignor, buyer, consignee/ship-to, manufacturer, carrier, loading and delivery addresses.
If an explicit Consignee/Ship-to/Грузополучатель is present, use it as consignee even if it differs from Buyer.
Preserve complete postal addresses exactly as printed, including street, building, city, postcode and country.
Extract EVERY product line separately, package/carton/pallet count, packaging, net weight, gross weight, volume and HS/CN code when present.
Never invent missing information. Use null when absent. Numbers must be JSON numbers without thousands separators.
Return ONLY valid JSON, no markdown, matching this shape:
${JSON.stringify(schema)}`;

    const content=[
      {type:'input_text',text:prompt},
      mimeType&&mimeType.startsWith('image/')
        ? {type:'input_image',image_url:`data:${mimeType};base64,${base64}`,detail:'high'}
        : {type:'input_file',filename,file_data:`data:${mimeType||'application/pdf'};base64,${base64}`}
    ];

    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-5.6-luna',input:[{role:'user',content}]})
    });
    const out=await r.json();
    if(!r.ok) throw new Error(out?.error?.message||'OpenAI API error');
    let text=out.output_text;
    if(!text && Array.isArray(out.output)){
      text=out.output.flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
    }
    text=String(text||'').trim().replace(/^\`\`\`json\s*/i,'').replace(/\`\`\`$/,'').trim();
    const data=JSON.parse(text);
    return res.status(200).json({data});
  }catch(e){
    return res.status(500).json({error:e.message||'Unable to analyze invoice'});
  }
}
