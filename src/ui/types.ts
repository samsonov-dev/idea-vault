export const statuses = ['inbox','refine','ready','progress','done'] as const;
export type Status = typeof statuses[number];
export type Priority = 'low' | 'medium' | 'high';
export type Idea = { id:string; title:string; description:string; status:Status; priority:Priority; tags:string; created_at:string; updated_at:string };
export const statusNames:Record<Status,string> = { inbox:'Входящие',refine:'На доработке',ready:'Готовы к работе',progress:'В работе',done:'Завершены' };
export const priorityNames:Record<Priority,string> = { low:'Низкий',medium:'Средний',high:'Высокий' };
export const priorityOptions = (['low','medium','high'] as const).map(value => ({value,label:priorityNames[value]}));
const errorMessages:Record<string,string> = { 'Internal error':'Внутренняя ошибка сервера', Unauthorized:'Необходимо войти в систему', Forbidden:'Доступ запрещён', 'Invalid input':'Некорректные данные', 'Invalid update':'Некорректные данные для обновления', 'Not found':'Идея не найдена', 'Method not allowed':'Действие не поддерживается' };
export const parseTags = (value:string):string[] => { try { const v:unknown=JSON.parse(value); return Array.isArray(v) ? v.filter((t):t is string=>typeof t==='string') : []; } catch { return []; } };
export async function api<T>(path:string, options?:RequestInit):Promise<T> { const res=await fetch(path,{...options,headers:{'content-type':'application/json',...options?.headers}}); const body=await res.json() as T & {error?:string}; if(!res.ok)throw new Error((body.error && errorMessages[body.error]) || 'Не удалось выполнить запрос'); return body; }
