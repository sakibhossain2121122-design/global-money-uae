/// <reference types="vite/client" />
import React, {useEffect, useRef, useState} from 'react';
import type {PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export function ReceiptPreview({url, type}: {url: string; type: string}) {
 if (type !== 'application/pdf') return <img src={url} alt="Receipt preview" style={{maxWidth:'100%'}}/>;
 return <PdfPreview url={url}/>;
}

function PdfPreview({url}: {url: string}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null);
 const [page,setPage]=useState(1);
 const [error,setError]=useState('');

 useEffect(()=>{
  let cancelled=false;
  let loading:PDFDocumentLoadingTask|undefined;
  void (async()=>{
   try {
    const response=await fetch(url);
    if(!response.ok)throw new Error('Receipt unavailable');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(cancelled)return;
    const pdfjs=await import('pdfjs-dist');
    if(cancelled)return;
    pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
    loading=pdfjs.getDocument({data:bytes,useSystemFonts:true,enableXfa:false,
     useWorkerFetch:false,useWasm:false,maxImageSize:16_000_000,canvasMaxAreaInBytes:64_000_000,stopAtErrors:true});
    const result=await loading.promise;
    if(!cancelled)setDocument(result);
   } catch {
    if(!cancelled)setError('Unable to render this PDF receipt.');
   }
  })();
  return ()=>{cancelled=true;if(loading)void loading.destroy();};
 },[url]);

 useEffect(()=>{
  if(!document || !canvas.current)return;
  let cancelled=false;
  let rendering:RenderTask|undefined;
  setError('');
  void (async()=>{
   try {
    const pdfPage=await document.getPage(page);
    if(cancelled || !canvas.current)return;
    const base=pdfPage.getViewport({scale:1});
    if(!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width<=0 || base.height<=0)throw new Error('Invalid page size');
    const viewport=pdfPage.getViewport({scale:Math.min(1.5,1200/base.width,1200/base.height)});
    canvas.current.width=Math.ceil(viewport.width);
    canvas.current.height=Math.ceil(viewport.height);
    rendering=pdfPage.render({canvas:canvas.current,viewport});
    await rendering.promise;
   } catch {
    if(!cancelled)setError('Unable to render this PDF page.');
   }
  })();
  return ()=>{cancelled=true;rendering?.cancel();};
 },[document,page]);

 return <div>
  {error&&<p role="alert">{error}</p>}
  {!document&&!error&&<p>Loading PDF receipt…</p>}
  {document&&<div><button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous page</button>
   <span> Page {page} of {document.numPages} </span>
   <button disabled={page>=document.numPages} onClick={()=>setPage(page+1)}>Next page</button></div>}
  <canvas ref={canvas} aria-label="PDF receipt page" style={{maxWidth:'100%',height:'auto'}}/>
 </div>;
}
