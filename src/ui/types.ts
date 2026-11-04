export const statuses = ['inbox','refine','ready','progress','done'] as const;
export type Status = typeof statuses[number];
export type Priority = 'low' | 'medium' | 'high';
export type Idea = { id:string; title:string; description:string; status:Status; priority:Priority; tags:string; created_at:string; updated_at:string };
export const statusNames:Record<Status,string> = { inbox:'Inbox',refine:'Refine',ready:'Ready',progress:'In progress',done:'Done' };
export const parseTags = (value:string):string[] => { try { const v:unknown=JSON.parse(value); return Array.isArray(v) ? v.filter((t):t is string=>typeof t==='string') : []; } catch { return []; } };
export async function api<T>(path:string, options?:RequestInit):Promise<T> { const res=await fetch(path,{...options,headers:{'content-type':'application/json',...options?.headers}}); const body=await res.json() as T & {error?:string}; if(!res.ok)throw new Error(body.error || 'Request failed'); return body; }
