// IDEA SWIPE · optional real-AI backend (Node.js 18+; no dependencies)
// Set OPENAI_API_KEY in the environment before starting. Never put your key in browser JS.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const publicHost = process.env.HOST || '127.0.0.1';

function json(res, code, data) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function readJson(req, limit=16384) {
  const chunks=[]; let total=0;
  for await (const chunk of req) { total+=chunk.length; if(total>limit) throw Error('请求太长'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function cleanIdea(value) {
  const str=(v,n=140)=>String(v??'').slice(0,n).trim();
  const a={title:str(value.title,40),summary:str(value.summary,180),core:str(value.core,130),kind:str(value.kind,28),icon:str(value.icon,8),detail:str(value.detail,280),tags:Array.isArray(value.tags)?value.tags.map(t=>str(t,22)).filter(Boolean).slice(0,5):[]};
  return a.title&&a.summary?a:null;
}
async function ideasFor(topic,blocked) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),55000);
  try {
    const input=[
      {role:'system',content:'你是一名专业且有想象力的交互设计头脑风暴伙伴。一次生成恰好 10 个互不重复、区别明显、便于实际学生项目落地的设计创意。每个创意只说明一个核心机制，适用于逐张卡片判断。必须输出有效 JSON 对象，唯一顶层字段是 ideas 数组。每项字段：title(不超过12个汉字，简练)、summary(约35-55字的一句话)、core(三个短语用 + 连接)、kind(不超过5字的创意类别)、tags(3个简短中文标签)、icon(一个emoji)、detail(约65-95字，讲清楚用户如何使用并含现实限制)。禁止输出 Markdown。避免重复空泛描述，创意必须体现不同机制，不仅是名称变化。'},
      {role:'user',content:`设计探索主题：${topic}\n不希望看到或涉及的标签：${blocked.length?blocked.join('、'):'无'}\n请生成 10 张彼此不同的创意卡，跳过屏蔽标签和相关方向。`}
    ];
    const response=await fetch(`${BASE}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${API_KEY}`},body:JSON.stringify({model:MODEL,messages:input,temperature:0.9,response_format:{type:'json_object'}}),signal:controller.signal});
    const raw=await response.json();if(!response.ok) throw Error(raw.error?.message || `模型服务 HTTP ${response.status}`);
    const content=raw.choices?.[0]?.message?.content;
    const parsed=JSON.parse(content||'{}');const seen=new Set();
    return (Array.isArray(parsed.ideas)?parsed.ideas:[]).map(cleanIdea).filter(Boolean).filter(c=>{if(seen.has(c.title)||c.tags.some(t=>blocked.includes(t)))return false;seen.add(c.title);return true}).slice(0,10);
  } finally {clearTimeout(timer)}
}
http.createServer(async(req,res)=>{
  try {
    const route=(req.url||'/').split('?')[0];
    if(req.method==='GET'&&(route==='/'||route==='/index.html')){
      const html=await fs.readFile(path.join(DIR,'index.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(html);
    }
    if(req.method==='GET'&&route==='/api/health')return json(res,200,{connected:Boolean(API_KEY),model:MODEL});
    if(req.method==='POST'&&route==='/api/ideas'){
      if(!API_KEY)return json(res,503,{error:'未设置 OPENAI_API_KEY，将使用浏览器内演示生成。'});
      const data=await readJson(req);const topic=String(data.topic||'').trim().slice(0,180);
      if(!topic)return json(res,400,{error:'请先输入设计主题'});
      const blocked=(Array.isArray(data.blocked)?data.blocked:[]).map(t=>String(t).slice(0,22)).slice(0,80);
      const ideas=await ideasFor(topic,blocked);
      if(!ideas.length)return json(res,502,{error:'模型没有返回有效点子'});
      return json(res,200,{ideas,mode:'live'});
    }
    json(res,404,{error:'Not found'});
  } catch(err){console.error('API Error',err?.message);json(res,500,{error:err?.name==='AbortError'?'AI 生成超时':err?.message||'服务异常'});}
}).listen(PORT,publicHost,()=>{
  console.log(`IDEA SWIPE running at http://${publicHost}:${PORT}`);
  console.log(API_KEY?`Real AI enabled (${MODEL})`:'Demo mode (no OPENAI_API_KEY set)');
});
