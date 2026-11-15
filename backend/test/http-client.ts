import {request as httpRequest} from 'node:http';

let nextClientAddress=0;

function freshClientAddress() {
 // Ordinary test calls use distinct clients so their volume cannot exhaust a shared per-IP budget.
 const index=nextClientAddress++;
 return `127.0.${1+Math.floor(index/254)}.${1+(index%254)}`;
}

export function requestJson(
 url:string,
 method='GET',
 body?:unknown,
 bearer?:string,
 localAddress=freshClientAddress()
) {
 return new Promise<{status:number;body:any}>((resolve,reject)=>{
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(bearer)headers.Authorization='Bearer '+bearer;
  const request=httpRequest(url,{method,headers,localAddress},response=>{
   response.setEncoding('utf8');
   let data='';
   response.on('data',(chunk:string)=>data+=chunk);
   response.on('end',()=>{
    try {resolve({status:response.statusCode??0,body:JSON.parse(data)});}
    catch(error) {reject(error);}
   });
   response.on('error',reject);
  });
  request.on('error',reject);
  if(body!==undefined)request.write(JSON.stringify(body));
  request.end();
 });
}
