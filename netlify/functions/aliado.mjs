import {getStore} from '@netlify/blobs';
import {getUser} from '@netlify/identity';
// Niveles de comisión según invitados: ajusta aquí metas y porcentajes (y en src/app.js).
const NIVELES=[{n:0,nombre:'Aliado',pct:20},{n:3,nombre:'Plata',pct:25},{n:10,nombre:'Oro',pct:30},{n:20,nombre:'Platino',pct:35},{n:30,nombre:'Élite',pct:40}];// n = invitados
const nivel=n=>[...NIVELES].reverse().find(x=>n>=x.n);
const siguiente=n=>NIVELES.find(x=>x.n>n)||null;
const admins=(process.env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
const J=(o,s=200)=>Response.json(o,{status:s});
export default async (req)=>{
  const user=await getUser();
  if(!user)return J({error:'Inicia sesión.'},401);
  const email=String(user.email).toLowerCase(),isAdmin=admins.includes(email),store=getStore('aliados');
  const get=k=>store.get(k,{type:'json'});
  if(req.method==='GET'){
    if(isAdmin){const {blobs}=await store.list();return J({admin:true,aliados:(await Promise.all(blobs.map(b=>get(b.key)))).filter(Boolean)})}
    const a=await get(email);if(!a)return J({pendiente:true,email,adminConfigurado:admins.length>0});
    const n=(a.invitados||[]).length;return J({aliado:a,nivel:nivel(n),siguiente:siguiente(n)});
  }
  if(!isAdmin)return J({error:'Sin permiso.'},403);
  const b=await req.json().catch(()=>({})),k=String(b.email||'').toLowerCase().trim();
  if(!k)return J({error:'Falta el correo.'},400);
  if(b.accion==='alta'){
    if(await get(k))return J({error:'Ese aliado ya existe.'},400);
    const codigo='VQ-'+(k.split('@')[0].replace(/[^a-z0-9]/g,'').slice(0,5).toUpperCase()||'ALI');
    await store.setJSON(k,{email:k,nombre:String(b.nombre||'').slice(0,80),codigo,ventas:[],invitados:[],creado:new Date().toISOString().slice(0,10)});return J({ok:1});
  }
  const a=await get(k);if(!a)return J({error:'Aliado no encontrado.'},404);
  if(b.accion==='venta'){
    const precio=Number(b.precio);if(!(precio>=0))return J({error:'Precio inválido.'},400);
    const pct=nivel((a.invitados||[]).length).pct;
    a.ventas.push({id:Date.now().toString(36),fecha:new Date().toISOString().slice(0,10),cliente:String(b.cliente||'').slice(0,80),servicio:String(b.servicio||'').slice(0,80),precio,comision:Math.round(precio*pct/100),comisionPagada:false});
  }else if(b.accion==='invitado'){
    const neg=String(b.negocio||'').trim().slice(0,80);if(!neg)return J({error:'Escribe el nombre del negocio.'},400);
    (a.invitados||=[]).push({id:Date.now().toString(36),fecha:new Date().toISOString().slice(0,10),negocio:neg});
  }else if(b.accion==='quitar'){
    if(b.tipo==='invitado')a.invitados=(a.invitados||[]).filter(x=>x.id!==b.id);
    else if(b.tipo==='venta')a.ventas=a.ventas.filter(x=>x.id!==b.id);
    else return J({error:'Tipo no válido.'},400);
  }else if(b.accion==='pagar'){
    const v=a.ventas.find(x=>x.id===b.id);if(!v)return J({error:'Venta no encontrada.'},404);v.comisionPagada=true;
  }else return J({error:'Acción no válida.'},400);
  await store.setJSON(k,a);return J({ok:1});
};
export const config={path:'/api/aliado'};
